# Muestra la página "Listo": IP de la PC, dirección para las tablets y enlace de alta.
# La página está en la carpeta de datos, que solo leen Administradores y SYSTEM; por eso
# se abre en esta ventana (con permisos de administrador) y no en el navegador.
. (Join-Path $PSScriptRoot 'common.ps1')
Request-Elevation $PSCommandPath -Hidden

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $ListoHtml)) {
  try { Update-ListoPage } catch { }
}
if (-not (Test-Path $ListoHtml)) {
  [System.Windows.Forms.MessageBox]::Show("Todavía no existe la página de instalación. Revisa $LogDir\instalacion.log", $AppName) | Out-Null
  exit 1
}

$data = $null
try { $data = [System.IO.File]::ReadAllText($ListoJson) | ConvertFrom-Json } catch { $data = $null }

$form = New-Object System.Windows.Forms.Form
$form.Text = "$AppName - Listo"
$form.Width = 860
$form.Height = 760
$form.StartPosition = 'CenterScreen'

$browser = New-Object System.Windows.Forms.WebBrowser
$browser.Dock = 'Fill'
$browser.IsWebBrowserContextMenuEnabled = $true
$browser.AllowWebBrowserDrop = $false
$browser.ScriptErrorsSuppressed = $true
$browser.DocumentText = [System.IO.File]::ReadAllText($ListoHtml, [System.Text.Encoding]::UTF8)

$bar = New-Object System.Windows.Forms.FlowLayoutPanel
$bar.Dock = 'Bottom'
$bar.Height = 72
$bar.Padding = New-Object System.Windows.Forms.Padding(12, 10, 12, 10)

# El sistema se abre con el mismo lanzador del Escritorio. Va por explorer.exe para que no
# herede los permisos de administrador de esta ventana.
function Open-System {
  Start-Process -FilePath (Join-Path $env:SystemRoot 'explorer.exe') -ArgumentList "`"$LauncherExe`""
}

function Add-MainButton([string]$Text) {
  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Text
  $button.AutoSize = $true
  $button.Height = 48
  $button.MinimumSize = New-Object System.Drawing.Size(260, 48)
  $button.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 13)
  $button.FlatStyle = 'Flat'
  $button.FlatAppearance.BorderSize = 0
  $button.BackColor = [System.Drawing.ColorTranslator]::FromHtml('#2f6b4f')
  $button.ForeColor = [System.Drawing.Color]::White
  $button.Add_Click({ Open-System })
  $bar.Controls.Add($button)
  $form.AcceptButton = $button
}

function Add-Button([string]$Text, [scriptblock]$OnClick) {
  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Text
  $button.AutoSize = $true
  $button.Height = 48
  $button.Add_Click($OnClick)
  $bar.Controls.Add($button)
}

# Sin usuarios, el lanzador lleva directo a crear la cadena: nadie copia ni pega enlaces.
if ($data -and $data.inviteLink) { Add-MainButton 'Crear mi cadena' } else { Add-MainButton 'Abrir Sobremesa Encuestas' }
if ($data -and $data.tabletUrl) {
  Add-Button 'Copiar dirección de las tablets' { [System.Windows.Forms.Clipboard]::SetText($data.tabletUrl) }
}
Add-Button 'Cerrar' { $form.Close() }

$form.Controls.Add($browser)
$form.Controls.Add($bar)
[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::Run($form)
