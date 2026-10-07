// Acceso directo "Sobremesa Encuestas" de la version instalada en PC (docs/INSTALAR-PC.md).
// Abre el sistema en una ventana propia, sin consola y sin pedir permisos de administrador.
//
// Lo compila installer/build.ps1 con el csc.exe de .NET Framework que trae Windows
// (C# 5: sin interpolacion de cadenas ni otras novedades).
//
//   SobremesaEncuestas.exe                 abre el sistema
//   SobremesaEncuestas.exe --print=ARCHIVO escribe en ARCHIVO lo que abriria y sale (pruebas)
//   SobremesaEncuestas.exe --puerto=N      otro puerto en lugar del 3000 (pruebas)
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.ServiceProcess;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Sobremesa Encuestas")]
[assembly: AssemblyProduct("Sobremesa Encuestas")]
[assembly: AssemblyCompany("SITIRT")]

static class Launcher
{
    static int port = 3000;
    static string Base { get { return "http://localhost:" + port; } }
    // Por 127.0.0.1 y no por "localhost": en algunas PCs localhost resuelve primero a IPv6.
    static string HealthUrl { get { return "http://127.0.0.1:" + port + "/api/health"; } }
    const string DbService = "SobremesaEncuestasDB";
    const string AppService = "SobremesaEncuestasApp";
    public const int WaitSeconds = 90;

    [DllImport("user32.dll")]
    static extern bool SetProcessDPIAware();

    [STAThread]
    static int Main(string[] args)
    {
        foreach (string arg in args)
        {
            if (arg.StartsWith("--puerto=", StringComparison.Ordinal)) int.TryParse(arg.Substring(9), out port);
        }
        foreach (string arg in args)
        {
            if (arg.StartsWith("--print=", StringComparison.Ordinal))
            {
                string edge = FindEdge();
                File.WriteAllText(arg.Substring(8),
                    "url=" + StartUrl() + "\r\n" +
                    "navegador=" + (edge ?? "predeterminado") + "\r\n" +
                    "argumentos=" + (edge == null ? "" : EdgeArguments(StartUrl())) + "\r\n" +
                    "salud=" + (IsUp() ? "ok" : "sin respuesta") + "\r\n",
                    new UTF8Encoding(false));
                return 0;
            }
        }

        try { SetProcessDPIAware(); } catch (Exception) { }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        if (!IsUp())
        {
            using (StartingForm form = new StartingForm())
            {
                if (form.ShowDialog() != DialogResult.OK) return 1;
            }
        }
        OpenSystem();
        return 0;
    }

    static string DataDir
    {
        get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "SobremesaEncuestas"); }
    }

    // /inicio decide a donde ir: sin usuarios, a crear la cadena; con usuarios, al login.
    // Pide la llave que el instalador dejo en esta PC; sin ella, se abre el login directo.
    static string StartUrl()
    {
        try
        {
            string key = File.ReadAllText(Path.Combine(DataDir, "publico", "llave-inicio.txt")).Trim();
            if (key.Length >= 32) return Base + "/inicio?llave=" + Uri.EscapeDataString(key);
        }
        catch (Exception) { }
        return Base + "/login";
    }

    public static bool IsUp()
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(HealthUrl);
            request.Timeout = 2500;
            request.ReadWriteTimeout = 2500;
            request.Proxy = null;
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream()))
            {
                return response.StatusCode == HttpStatusCode.OK && reader.ReadToEnd().Contains("\"status\":\"ok\"");
            }
        }
        catch (Exception)
        {
            return false;
        }
    }

    // El instalador da permiso a los usuarios de la PC para arrancar (solo arrancar) los dos servicios.
    public static void TryStartServices()
    {
        foreach (string name in new string[] { DbService, AppService })
        {
            try
            {
                using (ServiceController service = new ServiceController(name))
                {
                    if (service.Status == ServiceControllerStatus.Stopped)
                    {
                        service.Start();
                        service.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(30));
                    }
                }
            }
            catch (Exception)
            {
                // Sin permiso o el servicio no existe: se sigue esperando y, si no responde, se avisa.
            }
        }
    }

    static string FindEdge()
    {
        string[] candidates = new string[]
        {
            Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe", null, null) as string,
            Registry.GetValue(@"HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe", null, null) as string,
            Path.Combine(Environment.GetEnvironmentVariable("ProgramFiles(x86)") ?? "", @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetEnvironmentVariable("ProgramFiles") ?? "", @"Microsoft\Edge\Application\msedge.exe"),
        };
        foreach (string candidate in candidates)
        {
            if (!string.IsNullOrEmpty(candidate) && File.Exists(candidate)) return candidate;
        }
        return null;
    }

    // --app: ventana propia, sin pestanas ni barra de direcciones. Los otros dos evitan la
    // pantalla de bienvenida de Edge y la pregunta del navegador predeterminado.
    static string EdgeArguments(string url)
    {
        return "--app=\"" + url + "\" --no-first-run --no-default-browser-check";
    }

    static void OpenSystem()
    {
        string url = StartUrl();
        string edge = FindEdge();
        try
        {
            if (edge != null)
            {
                Process.Start(new ProcessStartInfo(edge, EdgeArguments(url)) { UseShellExecute = false });
                return;
            }
        }
        catch (Exception) { }
        try
        {
            // Sin Edge: el navegador predeterminado.
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch (Exception e)
        {
            MessageBox.Show("No se pudo abrir el navegador: " + e.Message + "\n\nAbre a mano " + Base, "Sobremesa Encuestas",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }
}

// Ventana "Iniciando...": espera a que la app responda (y arranca los servicios si estan detenidos)
// en vez de dejar que el navegador muestre un error de conexion.
sealed class StartingForm : Form
{
    readonly Label title = new Label();
    readonly Label detail = new Label();
    readonly ProgressBar progress = new ProgressBar();
    readonly Button retry = new Button();
    readonly Button close = new Button();
    readonly BackgroundWorker worker = new BackgroundWorker();

    public StartingForm()
    {
        Text = "Sobremesa Encuestas";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        Font = new Font("Segoe UI", 10f);
        ClientSize = new Size(460, 210);
        BackColor = Color.FromArgb(246, 243, 236);

        title.SetBounds(24, 22, 412, 34);
        title.Font = new Font("Segoe UI Semibold", 15f);
        title.ForeColor = Color.FromArgb(47, 107, 79);

        detail.SetBounds(24, 62, 412, 76);
        detail.ForeColor = Color.FromArgb(28, 38, 33);

        progress.SetBounds(24, 150, 412, 12);
        progress.Style = ProgressBarStyle.Marquee;
        progress.MarqueeAnimationSpeed = 30;

        retry.Text = "Reintentar";
        retry.SetBounds(214, 162, 108, 32);
        retry.Click += delegate { Begin(); };

        close.Text = "Cerrar";
        close.SetBounds(328, 162, 108, 32);
        close.Click += delegate { DialogResult = DialogResult.Cancel; Close(); };

        Controls.AddRange(new Control[] { title, detail, progress, retry, close });

        worker.WorkerSupportsCancellation = true;
        worker.DoWork += Wait;
        worker.RunWorkerCompleted += Finished;
        Shown += delegate { Begin(); };
        FormClosing += delegate { if (worker.IsBusy) worker.CancelAsync(); };
    }

    void Begin()
    {
        if (worker.IsBusy) return;
        title.Text = "Iniciando…";
        detail.Text = "El sistema está arrancando. Suele tardar menos de un minuto después de encender la PC.";
        progress.Visible = true;
        retry.Visible = false;
        close.Visible = false;
        worker.RunWorkerAsync();
    }

    void Wait(object sender, DoWorkEventArgs e)
    {
        Stopwatch watch = Stopwatch.StartNew();
        bool triedServices = false;
        while (watch.Elapsed.TotalSeconds < Launcher.WaitSeconds && !worker.CancellationPending)
        {
            if (Launcher.IsUp()) { e.Result = true; return; }
            if (!triedServices)
            {
                triedServices = true;
                Launcher.TryStartServices();
                continue;
            }
            Thread.Sleep(1500);
        }
        e.Result = false;
    }

    void Finished(object sender, RunWorkerCompletedEventArgs e)
    {
        if (IsDisposed) return;
        if (e.Error == null && e.Result is bool && (bool)e.Result)
        {
            DialogResult = DialogResult.OK;
            Close();
            return;
        }
        title.Text = "No se pudo iniciar";
        detail.Text = "El sistema no respondió. Reinicia la PC y vuelve a intentar. Si sigue igual, revisa en Servicios de Windows " +
            "que “Sobremesa Encuestas - Base de datos” y “Sobremesa Encuestas - Aplicación” estén en ejecución.";
        progress.Visible = false;
        retry.Visible = true;
        close.Visible = true;
    }
}
