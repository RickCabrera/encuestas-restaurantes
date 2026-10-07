# Funciones compartidas por los scripts de la versión instalada en PC (docs/INSTALAR-PC.md).
# Corre en Windows PowerShell 5.1, que es el que trae Windows.
$ErrorActionPreference = 'Stop'

$AppName = 'Sobremesa Encuestas'
$AppPort = 3000

# Programa: se reemplaza en cada actualización.
$InstallDir = Split-Path -Parent $PSScriptRoot
$PgBin = Join-Path $InstallDir 'pgsql\bin'
$NodeExe = Join-Path $InstallDir 'node\node.exe'
$ToolsJs = Join-Path $PSScriptRoot 'js'
$ServiceDir = Join-Path $InstallDir 'services'

# Datos: nunca se tocan al actualizar.
$DataDir = Join-Path $env:ProgramData 'SobremesaEncuestas'
$EnvFile = Join-Path $DataDir '.env'
$PgData = Join-Path $DataDir 'pgdata'
$BackupDir = Join-Path $DataDir 'backups'
$LogDir = Join-Path $DataDir 'logs'
$SecretDir = Join-Path $DataDir 'secretos'
# Lo único de la carpeta de datos que leen los usuarios sin permisos de administrador.
$PublicDir = Join-Path $DataDir 'publico'
$SetupKeyFile = Join-Path $PublicDir 'llave-inicio.txt'
$LauncherExe = Join-Path $InstallDir 'SobremesaEncuestas.exe'
$ListoHtml = Join-Path $DataDir 'listo.html'
$ListoJson = Join-Path $DataDir 'listo.json'
$PowerStateFile = Join-Path $DataDir 'energia-anterior.json'

$DbService = 'SobremesaEncuestasDB'
$AppService = 'SobremesaEncuestasApp'
$FirewallRule = 'SobremesaEncuestas-HTTP'
$BackupTask = 'Sobremesa Encuestas - Respaldo diario'

$PowerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# Cuentas por SID: los nombres cambian con el idioma de Windows.
$SidAdmins = '*S-1-5-32-544'
$SidSystem = '*S-1-5-18'
$SidLocalService = '*S-1-5-19'
$SidNetworkService = '*S-1-5-20'
$SidUsers = '*S-1-5-32-545'

function Test-Admin {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Los accesos directos piden permisos de administrador: el script se vuelve a abrir elevado.
function Request-Elevation([string]$ScriptPath, [string[]]$ScriptArgs = @(), [switch]$Hidden) {
  if (Test-Admin) { return }
  $list = @('-NoProfile', '-ExecutionPolicy', 'Bypass')
  if ($Hidden) { $list += @('-WindowStyle', 'Hidden') }
  $list += @('-File', "`"$ScriptPath`"") + $ScriptArgs
  try {
    Start-Process -FilePath $PowerShellExe -ArgumentList $list -Verb RunAs
  } catch {
    Write-Host 'Se necesitan permisos de administrador de Windows.'
    Start-Sleep -Seconds 4
  }
  exit
}

function Write-Log([string]$Message, [string]$File = 'instalacion.log') {
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Write-Host $line
  try {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
    Add-Content -Path (Join-Path $LogDir $File) -Value $line -Encoding UTF8
  } catch {
    # Sin bitácora la instalación sigue.
  }
}

function Format-NativeArg([string]$Value) {
  if ($Value -eq '') { return '""' }
  if ($Value -notmatch '[\s"]') { return $Value }
  $escaped = $Value -replace '(\\*)"', '$1$1\"'
  $escaped = $escaped -replace '(\\+)$', '$1$1'
  return '"' + $escaped + '"'
}

# Ejecuta un programa y devuelve código de salida, salida y errores, sin las sorpresas de
# PowerShell 5.1 con stderr. $Environment agrega variables solo para ese proceso (contraseñas).
function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)][string]$File,
    [string[]]$Arguments = @(),
    [hashtable]$Environment = @{},
    [string]$WorkDir = ''
  )
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $File
  $psi.Arguments = ($Arguments | ForEach-Object { Format-NativeArg $_ }) -join ' '
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
  $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
  if ($WorkDir) { $psi.WorkingDirectory = $WorkDir }
  foreach ($key in $Environment.Keys) { $psi.EnvironmentVariables[$key] = [string]$Environment[$key] }
  $process = [System.Diagnostics.Process]::Start($psi)
  $stderr = $process.StandardError.ReadToEndAsync()
  $stdout = $process.StandardOutput.ReadToEnd()
  $process.WaitForExit()
  return [pscustomobject]@{ ExitCode = $process.ExitCode; Output = $stdout.Trim(); Error = $stderr.Result.Trim() }
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$What,
    [Parameter(Mandatory = $true)][string]$File,
    [string[]]$Arguments = @(),
    [hashtable]$Environment = @{},
    [string]$WorkDir = ''
  )
  $r = Invoke-Native -File $File -Arguments $Arguments -Environment $Environment -WorkDir $WorkDir
  if ($r.ExitCode -ne 0) { throw "$What falló (código $($r.ExitCode)). $($r.Error) $($r.Output)" }
  return $r
}

function New-Secret([int]$Bytes) {
  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
  return -join ($buffer | ForEach-Object { $_.ToString('x2') })
}

function Read-EnvFile([string]$Path = $EnvFile) {
  $values = [ordered]@{}
  foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $value = $Matches[2].Trim()
      if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) { $value = $value.Substring(1, $value.Length - 2) }
      $values[$Matches[1]] = $value
    }
  }
  return $values
}

# Sin BOM: `node --env-file` no lo entiende. Escribir sobre el archivo conserva sus permisos.
function Write-EnvFile($Values, [string]$Path = $EnvFile) {
  $lines = @(
    '# Sobremesa Encuestas: configuración de ESTA PC. La crea el instalador y las actualizaciones la conservan.',
    '# No la copies a otra PC ni la compartas: trae el secreto de las sesiones y la contraseña de la base.'
  )
  foreach ($key in $Values.Keys) { $lines += "$key=$($Values[$key])" }
  [System.IO.File]::WriteAllText($Path, ($lines -join "`n") + "`n", $Utf8NoBom)
}

function Get-InstalledVersion {
  $file = Join-Path $InstallDir 'version.txt'
  if (Test-Path $file) { return ([System.IO.File]::ReadAllText($file)).Trim() }
  return 'desconocida'
}

function Test-ServiceExists([string]$Name) {
  return [bool](Get-Service -Name $Name -ErrorAction SilentlyContinue)
}

function Stop-AppServices {
  foreach ($name in @($AppService, $DbService)) {
    $service = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($service -and $service.Status -ne 'Stopped') {
      Stop-Service -Name $name -Force -ErrorAction SilentlyContinue
      (Get-Service -Name $name).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(120))
    }
  }
}

function Start-ServiceAndWait([string]$Name) {
  $service = Get-Service -Name $Name
  if ($service.Status -ne 'Running') { Start-Service -Name $Name }
  (Get-Service -Name $Name).WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
}

function Get-DbEnvironment($Values) {
  return @{ PGPASSWORD = $Values['LOCAL_DB_PASSWORD']; PGCLIENTENCODING = 'UTF8'; PGCONNECT_TIMEOUT = '5' }
}

function Get-DbArgs($Values) {
  return @('-h', '127.0.0.1', '-p', $Values['LOCAL_DB_PORT'], '-U', $Values['LOCAL_DB_USER'])
}

function Wait-Database([string]$Port) {
  $isReady = Join-Path $PgBin 'pg_isready.exe'
  for ($i = 0; $i -lt 60; $i++) {
    $r = Invoke-Native -File $isReady -Arguments @('-h', '127.0.0.1', '-p', $Port, '-t', '2')
    if ($r.ExitCode -eq 0) { return }
    Start-Sleep -Seconds 2
  }
  throw "PostgreSQL no respondió en 127.0.0.1:$Port. Revisa $LogDir"
}

function Wait-App {
  $url = "http://127.0.0.1:$AppPort/api/health?db=1"
  for ($i = 0; $i -lt 60; $i++) {
    try {
      $res = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 5
      if ($res.StatusCode -eq 200 -and $res.Content -match '"status":"ok"') { return }
    } catch {
      # Todavía arrancando.
    }
    Start-Sleep -Seconds 2
  }
  throw "La app no respondió en $url. Revisa $LogDir"
}

function Invoke-Tool([string]$Name, [string[]]$Arguments = @(), [hashtable]$Environment = @{}) {
  $all = @("--env-file=$EnvFile", (Join-Path $ToolsJs $Name)) + $Arguments
  return Invoke-Native -File $NodeExe -Arguments $all -Environment $Environment
}

# Enlace de un solo uso para crear la cadena y su usuario maestro. No se escribe en la bitácora.
function New-OrgInviteLink {
  $r = Invoke-Tool 'invite-org.cjs'
  if ($r.ExitCode -ne 0) { throw "No se pudo generar el enlace de alta. $($r.Error)" }
  if ($r.Output -match '(https?://\S+/registro\?codigo=[A-Za-z0-9_-]+)') { return $Matches[1] }
  throw 'No se pudo leer el enlace de alta.'
}

function Get-UserCount($Values) {
  $psql = Join-Path $PgBin 'psql.exe'
  $arguments = (Get-DbArgs $Values) + @('-d', $Values['LOCAL_DB_NAME'], '-tA', '-c', 'select count(*) from users')
  $r = Invoke-Checked -What 'Contar usuarios' -File $psql -Arguments $arguments -Environment (Get-DbEnvironment $Values)
  return [int]$r.Output
}

# IP de la PC en la red local: la tarjeta con puerta de enlace, de preferencia física.
function Get-LanInfo {
  $best = $null
  try {
    $physical = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue | ForEach-Object { $_.ifIndex })
    $ranked = foreach ($config in (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address -and $_.NetAdapter.Status -eq 'Up' })) {
      $metric = (Get-NetIPInterface -InterfaceIndex $config.InterfaceIndex -AddressFamily IPv4).InterfaceMetric
      [pscustomobject]@{
        Ip       = ($config.IPv4Address | Select-Object -First 1).IPAddress
        Index    = $config.InterfaceIndex
        Alias    = $config.InterfaceAlias
        Virtual  = ($physical -notcontains $config.InterfaceIndex)
        Metric   = $metric
      }
    }
    $best = $ranked | Sort-Object Virtual, Metric | Select-Object -First 1
  } catch {
    $best = $null
  }
  if (-not $best) {
    $address = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1
    if ($address) { $best = [pscustomobject]@{ Ip = $address.IPAddress; Index = $address.InterfaceIndex; Alias = $address.InterfaceAlias } }
  }
  if (-not $best) { return [pscustomobject]@{ Ip = $null; Alias = $null; Category = $null } }
  $category = $null
  try { $category = [string](Get-NetConnectionProfile -InterfaceIndex $best.Index -ErrorAction Stop | Select-Object -First 1).NetworkCategory } catch { $category = $null }
  return [pscustomobject]@{ Ip = $best.Ip; Alias = $best.Alias; Category = $category }
}

function ConvertTo-Html([string]$Text) {
  return [System.Net.WebUtility]::HtmlEncode($Text)
}

# Escribe la página "Listo" (y sus datos en JSON para la ventana que la muestra).
# Queda en la carpeta de datos, que solo pueden leer Administradores y SYSTEM.
function Update-ListoPage([string]$InviteLink = '') {
  $values = Read-EnvFile
  $lan = Get-LanInfo
  $version = Get-InstalledVersion
  $appUrl = $values['APP_URL']
  $currentUrl = if ($lan.Ip) { "http://$($lan.Ip):$AppPort" } else { $null }

  $warnings = ''
  if (-not $lan.Ip) {
    $warnings += '<div class="warn"><strong>Esta PC no tiene red.</strong> Conéctala al Wi-Fi o al cable del restaurante y usa el acceso directo "Actualizar la IP" del menú Inicio.</div>'
  } elseif ($currentUrl -ne $appUrl) {
    $warnings += '<div class="warn"><strong>La IP de esta PC cambió.</strong> Ahora es ' + (ConvertTo-Html $lan.Ip) + ', pero el sistema sigue configurado con ' + (ConvertTo-Html $appUrl) + '. Usa el acceso directo "Actualizar la IP" del menú Inicio.</div>'
  }
  if ($lan.Category -eq 'Public') {
    $warnings += '<div class="warn"><strong>La red de esta PC está marcada como "Pública".</strong> Así Windows bloquea a las tablets. Cámbiala a "Privada": Configuración &gt; Red e Internet &gt; (tu Wi-Fi o Ethernet) &gt; Tipo de perfil de red &gt; Privada. Los pasos completos están en INSTALAR-PC.</div>'
  }

  if ($InviteLink) {
    $invite = '<h2>3. Crea tu cadena y el usuario maestro</h2>' +
      '<p>Toca el botón <strong>Crear mi cadena</strong>, aquí abajo. Escribes el nombre de tu cadena, tu nombre, tu correo y una contraseña, y listo.</p>' +
      '<p class="note">Otra forma, desde otro equipo de la misma red: abre este enlace. Sirve una sola vez y vence en 7 días.<br /><span class="link">' + (ConvertTo-Html $InviteLink) + '</span></p>'
  } else {
    $invite = '<h2>3. Entra al sistema</h2>' +
      '<p>Toca el botón <strong>Abrir Sobremesa Encuestas</strong>, aquí abajo, o usa el icono del Escritorio.</p>' +
      '<p class="note">Para dar de alta otra cadena usa el acceso directo "Generar enlace de alta nuevo" del menú Inicio.</p>'
  }

  $template = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'listo.template.html'), [System.Text.Encoding]::UTF8)
  $html = $template
  $html = $html.Replace('{{VERSION}}', (ConvertTo-Html $version))
  $html = $html.Replace('{{IP}}', (ConvertTo-Html $(if ($lan.Ip) { $lan.Ip } else { 'sin red' })))
  $html = $html.Replace('{{TABLET_URL}}', (ConvertTo-Html $appUrl))
  $html = $html.Replace('{{WARNINGS}}', $warnings)
  $html = $html.Replace('{{INVITE}}', $invite)
  $html = $html.Replace('{{BACKUPS}}', (ConvertTo-Html $BackupDir))
  $html = $html.Replace('{{DATE}}', (Get-Date -Format 'yyyy-MM-dd HH:mm'))
  [System.IO.File]::WriteAllText($ListoHtml, $html, (New-Object System.Text.UTF8Encoding($true)))

  $data = [ordered]@{ version = $version; ip = $lan.Ip; tabletUrl = $appUrl; inviteLink = $InviteLink; networkCategory = $lan.Category }
  [System.IO.File]::WriteAllText($ListoJson, ($data | ConvertTo-Json), $Utf8NoBom)
}

# ───────── Suspensión con corriente ─────────

$SleepSettings = [ordered]@{
  standby   = '29f6c1db-86da-48c5-9fdb-f2b67b1f44da'
  hibernate = '9d7815a6-7ee4-497e-8888-515a05f02364'
}
$SleepSubgroup = '238c9fa8-0aad-41ed-83f4-97be242c8f20'

function Get-ActivePowerScheme {
  $plan = Get-CimInstance -Namespace 'root\cimv2\power' -ClassName Win32_PowerPlan | Where-Object { $_.IsActive } | Select-Object -First 1
  if ($plan -and $plan.InstanceID -match '\{([0-9a-fA-F-]{36})\}') { return $Matches[1] }
  return $null
}

# La PC es el servidor: si se duerme, las tablets se quedan sin sistema. Se guarda el valor
# anterior (solo la primera vez) para devolverlo al desinstalar.
function Disable-AcSleep {
  $powercfg = Join-Path $env:SystemRoot 'System32\powercfg.exe'
  $scheme = $null
  $previous = [ordered]@{}
  try {
    $scheme = Get-ActivePowerScheme
    if ($scheme) {
      $indexes = Get-CimInstance -Namespace 'root\cimv2\power' -ClassName Win32_PowerSettingDataIndex
      foreach ($name in $SleepSettings.Keys) {
        $id = "*{$scheme}\AC\{$($SleepSettings[$name])}*"
        $row = $indexes | Where-Object { $_.InstanceID -like $id } | Select-Object -First 1
        if ($row) { $previous[$name] = [int64]$row.SettingIndexValue }
      }
    }
  } catch {
    $scheme = $null
  }
  if (-not (Test-Path $PowerStateFile)) {
    $state = [ordered]@{ scheme = $scheme; standby = $previous['standby']; hibernate = $previous['hibernate'] }
    [System.IO.File]::WriteAllText($PowerStateFile, ($state | ConvertTo-Json), $Utf8NoBom)
  }
  Invoke-Native -File $powercfg -Arguments @('/change', 'standby-timeout-ac', '0') | Out-Null
  Invoke-Native -File $powercfg -Arguments @('/change', 'hibernate-timeout-ac', '0') | Out-Null
}

function Restore-AcSleep {
  if (-not (Test-Path $PowerStateFile)) { return }
  $powercfg = Join-Path $env:SystemRoot 'System32\powercfg.exe'
  try {
    $state = [System.IO.File]::ReadAllText($PowerStateFile) | ConvertFrom-Json
    if ($state.scheme) {
      foreach ($name in $SleepSettings.Keys) {
        $seconds = $state.$name
        if ($null -ne $seconds) {
          Invoke-Native -File $powercfg -Arguments @('/setacvalueindex', $state.scheme, $SleepSubgroup, $SleepSettings[$name], [string]$seconds) | Out-Null
        }
      }
      $active = Get-ActivePowerScheme
      if ($active) { Invoke-Native -File $powercfg -Arguments @('/setactive', $active) | Out-Null }
    }
  } catch {
    # Si no se pudo restaurar, se cambia a mano en Configuración > Sistema > Energía.
  }
  Remove-Item -Path $PowerStateFile -Force -ErrorAction SilentlyContinue
}
