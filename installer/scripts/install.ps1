# Configura la PC después de copiar los archivos. Lo llama el Setup.exe, tanto en una
# instalación nueva como al instalar una versión nueva encima (actualización).
#
# Reglas que no se rompen:
#   - Si ya hay una base (pgdata\PG_VERSION), NUNCA se vuelve a crear: solo migraciones pendientes.
#   - El .env de esta PC se conserva; solo se le agregan claves que falten.
#   - Nunca se corre el seed (ni siquiera viene en el paquete).
param(
  [string]$Version = ''
)

. (Join-Path $PSScriptRoot 'common.ps1')

$StateFile = Join-Path $DataDir 'instalacion-estado.json'
# Existe mientras la primera instalación no termina: permite reanudarla si se interrumpió.
$IncompleteFlag = Join-Path $DataDir 'instalacion-incompleta.flag'
$SuperuserFile = Join-Path $SecretDir 'postgres-superusuario.txt'
$Icacls = Join-Path $env:SystemRoot 'System32\icacls.exe'
$Sc = Join-Path $env:SystemRoot 'System32\sc.exe'

function Set-Acl-Grant([string]$Path, [string[]]$Grants) {
  Invoke-Checked -What "Permisos de $Path" -File $Icacls -Arguments (@($Path, '/grant:r') + $Grants) | Out-Null
}

function Get-PgMajor {
  $r = Invoke-Checked -What 'postgres --version' -File (Join-Path $PgBin 'postgres.exe') -Arguments @('--version')
  if ($r.Output -match '(\d+)\.\d+') { return $Matches[1] }
  throw "No se pudo leer la versión de PostgreSQL: $($r.Output)"
}

function Test-PortInUse([int]$Port) {
  return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Install-VcRuntime {
  $key = 'HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64'
  $installed = (Get-ItemProperty -Path $key -ErrorAction SilentlyContinue).Installed
  if ($installed -eq 1) { return }
  Write-Log 'Instalando el runtime de Visual C++ (lo necesita PostgreSQL)...'
  $r = Invoke-Native -File (Join-Path $InstallDir 'redist\vc_redist.x64.exe') -Arguments @('/install', '/quiet', '/norestart')
  # 3010: instalado, pide reiniciar. 1638: ya hay una versión más nueva.
  if (@(0, 3010, 1638) -notcontains $r.ExitCode) { throw "No se pudo instalar el runtime de Visual C++ (código $($r.ExitCode))." }
}

function Write-ServiceXml([string]$Id, [string]$Body) {
  $xml = "<service>`n  <id>$Id</id>`n$Body`n  <startmode>Automatic</startmode>`n  <logpath>$LogDir</logpath>`n" +
    "  <log mode=`"roll-by-size`">`n    <sizeThreshold>5120</sizeThreshold>`n    <keepFiles>5</keepFiles>`n  </log>`n" +
    "  <onfailure action=`"restart`" delay=`"10 sec`"/>`n  <onfailure action=`"restart`" delay=`"60 sec`"/>`n</service>`n"
  [System.IO.File]::WriteAllText((Join-Path $ServiceDir "$Id.xml"), $xml, $Utf8NoBom)
  Copy-Item -Path (Join-Path $ServiceDir 'winsw.exe') -Destination (Join-Path $ServiceDir "$Id.exe") -Force
}

# Registra el servicio (si falta) y fija su cuenta: ninguna es LocalSystem ni administrador.
function Register-AppService([string]$Id, [string]$Account) {
  if (-not (Test-ServiceExists $Id)) {
    Invoke-Checked -What "Registrar el servicio $Id" -File (Join-Path $ServiceDir "$Id.exe") -Arguments @('install') | Out-Null
  }
  Invoke-Checked -What "Cuenta del servicio $Id" -File $Sc -Arguments @('config', $Id, 'obj=', $Account, 'password=', '', 'start=', 'auto') | Out-Null
}

# Permiso para ARRANCAR el servicio (y ver su estado) a los usuarios de la PC, para que el
# acceso directo pueda levantarlo si está detenido. Detenerlo o reconfigurarlo sigue siendo
# cosa de administradores. En SDDL: RP = arrancar, LC = consultar estado, BU = Usuarios.
function Grant-ServiceStart([string]$Id) {
  $ace = '(A;;RPLC;;;BU)'
  $sddl = (Invoke-Checked -What "Leer permisos del servicio $Id" -File $Sc -Arguments @('sdshow', $Id)).Output -replace '\s', ''
  if ($sddl.Contains($ace)) { return }
  $sacl = $sddl.IndexOf('S:')
  $updated = if ($sacl -lt 0) { $sddl + $ace } else { $sddl.Substring(0, $sacl) + $ace + $sddl.Substring($sacl) }
  Invoke-Checked -What "Permiso de arranque del servicio $Id" -File $Sc -Arguments @('sdset', $Id, $updated) | Out-Null
}

function Initialize-Folders {
  foreach ($dir in @($DataDir, $PgData, $BackupDir, $LogDir, (Join-Path $LogDir 'postgres'), $SecretDir, $PublicDir)) {
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  }
  # La carpeta de datos (con backups\, secretos\, .env y la página "Listo") solo la leen
  # Administradores y SYSTEM. Cada servicio recibe únicamente lo que necesita.
  Invoke-Checked -What 'Permisos de la carpeta de datos' -File $Icacls -Arguments @($DataDir, '/inheritance:r', '/grant:r', "${SidAdmins}:(OI)(CI)F", "${SidSystem}:(OI)(CI)F") | Out-Null
  Set-Acl-Grant $PgData @("${SidNetworkService}:(OI)(CI)F")
  Set-Acl-Grant $LogDir @("${SidNetworkService}:(OI)(CI)M", "${SidLocalService}:(OI)(CI)M")
  Set-Acl-Grant $PublicDir @("${SidUsers}:(OI)(CI)R")
}

function Initialize-EnvFile([bool]$Fresh) {
  if (-not (Test-Path $EnvFile)) {
    $port = 5433
    while ((Test-PortInUse $port) -and $port -lt 5460) { $port++ }
    $lan = Get-LanInfo
    $address = if ($lan.Ip) { $lan.Ip } else { 'localhost' }
    $password = New-Secret 24
    $values = [ordered]@{
      APP_MODE          = 'local'
      APP_URL           = "http://${address}:$AppPort"
      AUTH_SECRET       = New-Secret 48
      SESSION_DAYS      = '7'
      DATABASE_URL      = "postgres://encuestas:$password@127.0.0.1:$port/encuestas"
      DATABASE_POOL_MAX = '10'
      LOCAL_DB_PORT     = [string]$port
      LOCAL_DB_NAME     = 'encuestas'
      LOCAL_DB_USER     = 'encuestas'
      LOCAL_DB_PASSWORD = $password
      LOCAL_SETUP_KEY   = New-Secret 32
    }
    # Primero el archivo vacío con sus permisos; después los secretos.
    [System.IO.File]::WriteAllText($EnvFile, '', $Utf8NoBom)
    Set-Acl-Grant $EnvFile @("${SidLocalService}:R")
    Write-EnvFile $values
    Write-Log "Configuración creada en $EnvFile (PostgreSQL en 127.0.0.1:$port)."
  } else {
    Set-Acl-Grant $EnvFile @("${SidLocalService}:R")
    $values = Read-EnvFile
    $changed = $false
    foreach ($default in @(@('APP_MODE', 'local'), @('SESSION_DAYS', '7'), @('DATABASE_POOL_MAX', '10'), @('LOCAL_SETUP_KEY', (New-Secret 32)))) {
      if (-not $values.Contains($default[0])) { $values[$default[0]] = $default[1]; $changed = $true }
    }
    if ($changed) { Write-EnvFile $values }
    Write-Log "Se conserva la configuración de $EnvFile."
  }
  # La llave de /inicio, donde la pueda leer el acceso directo (que no pide administrador).
  [System.IO.File]::WriteAllText($SetupKeyFile, (Read-EnvFile)['LOCAL_SETUP_KEY'], $Utf8NoBom)
  if (-not (Test-Path $SuperuserFile)) {
    if (-not $Fresh) { return }
    [System.IO.File]::WriteAllText($SuperuserFile, (New-Secret 24), $Utf8NoBom)
  }
}

function Initialize-Cluster($Values) {
  Write-Log 'Creando la base de datos (initdb)...'
  # initdb no corre con permisos de administrador: baja sus privilegios y entonces necesita
  # que la cuenta que instala tenga acceso directo a la carpeta.
  $me = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $grantMe = ($me -ne 'S-1-5-18')
  if ($grantMe) { Set-Acl-Grant $PgData @("*${me}:(OI)(CI)F") }
  $pwFile = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($pwFile, [System.IO.File]::ReadAllText($SuperuserFile).Trim(), $Utf8NoBom)
    $arguments = @('-D', $PgData, '-U', 'postgres', '-A', 'scram-sha-256', "--pwfile=$pwFile", '-E', 'UTF8',
      '--locale=C', '--locale-provider=icu', '--icu-locale=es-MX')
    Invoke-Checked -What 'initdb' -File (Join-Path $PgBin 'initdb.exe') -Arguments $arguments | Out-Null
  } finally {
    Remove-Item -Path $pwFile -Force -ErrorAction SilentlyContinue
    if ($grantMe) { Invoke-Native -File $Icacls -Arguments @($PgData, '/remove:g', "*$me", '/T', '/C', '/Q') | Out-Null }
  }

  # Solo esta PC puede conectarse, y siempre con contraseña.
  $hba = "# Sobremesa Encuestas: solo conexiones desde esta misma PC, con contraseña.`nhost    all    all    127.0.0.1/32    scram-sha-256`n"
  [System.IO.File]::WriteAllText((Join-Path $PgData 'pg_hba.conf'), $hba, $Utf8NoBom)
  $logs = (Join-Path $LogDir 'postgres').Replace('\', '/')
  $conf = "`n# ─── Sobremesa Encuestas ───`nlisten_addresses = '127.0.0.1'`nport = $($Values['LOCAL_DB_PORT'])`npassword_encryption = 'scram-sha-256'`n" +
    "logging_collector = on`nlog_directory = '$logs'`nlog_filename = 'postgres-%a.log'`nlog_truncate_on_rotation = on`nlog_rotation_age = 1d`n"
  [System.IO.File]::AppendAllText((Join-Path $PgData 'postgresql.conf'), $conf, $Utf8NoBom)
}

# Crea el rol y la base de la app si faltan. No borra ni reemplaza nada.
function Initialize-Database($Values) {
  $psql = Join-Path $PgBin 'psql.exe'
  $environment = @{ PGPASSWORD = [System.IO.File]::ReadAllText($SuperuserFile).Trim(); PGCLIENTENCODING = 'UTF8' }
  $base = @('-h', '127.0.0.1', '-p', $Values['LOCAL_DB_PORT'], '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA', '-c')
  $user = $Values['LOCAL_DB_USER']
  $name = $Values['LOCAL_DB_NAME']
  $hasRole = (Invoke-Checked -What 'Consultar rol' -File $psql -Arguments ($base + "select 1 from pg_roles where rolname = '$user'") -Environment $environment).Output
  if ($hasRole -ne '1') {
    Invoke-Checked -What 'Crear rol' -File $psql -Arguments ($base + "create role $user login password '$($Values['LOCAL_DB_PASSWORD'])'") -Environment $environment | Out-Null
  }
  $hasDb = (Invoke-Checked -What 'Consultar base' -File $psql -Arguments ($base + "select 1 from pg_database where datname = '$name'") -Environment $environment).Output
  if ($hasDb -ne '1') {
    Invoke-Checked -What 'Crear base' -File $psql -Arguments ($base + "create database $name owner $user") -Environment $environment | Out-Null
    Write-Log "Base '$name' creada."
  }
}

function Register-Services($Values) {
  $pgCtl = Join-Path $PgBin 'pg_ctl.exe'
  Write-ServiceXml $DbService (@(
      "  <name>$AppName - Base de datos</name>",
      '  <description>PostgreSQL de Sobremesa Encuestas. Solo acepta conexiones de esta PC (127.0.0.1).</description>',
      "  <executable>$(Join-Path $PgBin 'postgres.exe')</executable>",
      "  <arguments>-D `"$PgData`"</arguments>",
      "  <stopexecutable>$pgCtl</stopexecutable>",
      "  <stoparguments>stop -D `"$PgData`" -m fast -w -t 60</stoparguments>",
      '  <stoptimeout>90 sec</stoptimeout>'
    ) -join "`n")
  Write-ServiceXml $AppService (@(
      "  <name>$AppName - Aplicación</name>",
      "  <description>Panel y encuestas de Sobremesa en http://IP-de-esta-PC:$AppPort</description>",
      "  <executable>$NodeExe</executable>",
      "  <arguments>--env-file=`"$EnvFile`" local-server.cjs</arguments>",
      "  <workingdirectory>$(Join-Path $InstallDir 'app')</workingdirectory>",
      '  <env name="NODE_ENV" value="production"/>',
      '  <env name="APP_MODE" value="local"/>',
      "  <env name=`"APP_VERSION`" value=`"$Version`"/>",
      "  <env name=`"PORT`" value=`"$AppPort`"/>",
      '  <env name="HOSTNAME" value="0.0.0.0"/>',
      '  <env name="NEXT_TELEMETRY_DISABLED" value="1"/>',
      "  <depend>$DbService</depend>",
      '  <stoptimeout>30 sec</stoptimeout>'
    ) -join "`n")
  Register-AppService $DbService 'NT AUTHORITY\NetworkService'
  Register-AppService $AppService 'NT AUTHORITY\LocalService'
  Grant-ServiceStart $DbService
  Grant-ServiceStart $AppService
}

function Register-Firewall {
  Get-NetFirewallRule -Name $FirewallRule -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  # Solo red privada: en una red "Pública" Windows sigue bloqueando el puerto.
  New-NetFirewallRule -Name $FirewallRule -DisplayName "$AppName (puerto $AppPort)" -Description 'Tablets y panel en la red local del restaurante.' `
    -Direction Inbound -Action Allow -Protocol TCP -LocalPort $AppPort -Profile Private | Out-Null
}

function Register-BackupTask {
  $action = New-ScheduledTaskAction -Execute $PowerShellExe -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'backup.ps1')`""
  $trigger = New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours(5))
  # StartWhenAvailable: si la PC estaba apagada a las 5:00, corre al encender.
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $BackupTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
}

try {
  if (-not (Test-Admin)) { throw 'La instalación necesita permisos de administrador.' }
  if (-not $Version) { $Version = Get-InstalledVersion }
  if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Force -Path $DataDir | Out-Null }
  Write-Log "=== Instalación de $AppName $Version ==="

  $hadCluster = Test-Path (Join-Path $PgData 'PG_VERSION')
  $incomplete = Test-Path $IncompleteFlag
  # Actualización: ya hay una base completa. Todo lo demás es (o reanuda) una instalación nueva.
  $isUpdate = $hadCluster -and -not $incomplete
  if ($hadCluster -and -not (Test-Path $EnvFile)) {
    throw "Hay una base de datos en $PgData pero falta $EnvFile. No se toca nada: restaura el .env de esta PC y vuelve a instalar."
  }
  $pgMajor = Get-PgMajor
  if ($hadCluster) {
    $dataMajor = ([System.IO.File]::ReadAllText((Join-Path $PgData 'PG_VERSION'))).Trim()
    if ($dataMajor -ne $pgMajor) { throw "La base es de PostgreSQL $dataMajor y este instalador trae PostgreSQL $pgMajor. No se toca nada." }
  }

  Stop-AppServices
  Initialize-Folders
  Install-VcRuntime
  if (-not $isUpdate) { [System.IO.File]::WriteAllText($IncompleteFlag, (Get-Date -Format 's'), $Utf8NoBom) }
  Initialize-EnvFile (-not $isUpdate)
  $values = Read-EnvFile

  if (-not $hadCluster) {
    # Restos de un initdb interrumpido en la primera instalación: todavía no había datos.
    if ($incomplete -and (Get-ChildItem -Path $PgData -Force | Select-Object -First 1)) {
      Get-ChildItem -Path $PgData -Force | Remove-Item -Recurse -Force
    }
    Initialize-Cluster $values
  }

  Register-Services $values
  Write-Log 'Arrancando la base de datos...'
  Start-ServiceAndWait $DbService
  Wait-Database $values['LOCAL_DB_PORT']

  if ($isUpdate) {
    Write-Log 'Respaldo de seguridad antes de actualizar...'
    $backup = Invoke-Native -File $PowerShellExe -Arguments @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'backup.ps1'), '-Prefix', 'antes-de-actualizar', '-Keep', '3')
    if ($backup.ExitCode -ne 0) { throw "No se pudo respaldar la base antes de actualizar; no se aplicó ninguna migración. $($backup.Output)" }
  } else {
    Initialize-Database $values
  }

  Write-Log 'Aplicando migraciones pendientes...'
  $migrate = Invoke-Tool 'migrate.cjs' @() @{ MIGRATIONS_DIR = (Join-Path $PSScriptRoot 'drizzle') }
  if ($migrate.ExitCode -ne 0) { throw "Las migraciones fallaron. $($migrate.Error) $($migrate.Output)" }
  Remove-Item -Path $IncompleteFlag -Force -ErrorAction SilentlyContinue

  Write-Log 'Arrancando la aplicación...'
  Start-ServiceAndWait $AppService
  Wait-App

  Register-Firewall
  Register-BackupTask
  Disable-AcSleep

  # El enlace de alta solo se genera cuando todavía no hay ningún usuario.
  $link = ''
  if ((Get-UserCount $values) -eq 0) { $link = New-OrgInviteLink }
  Update-ListoPage $link

  $state = [ordered]@{ ok = $true; version = $Version; update = $isUpdate; date = (Get-Date -Format 's') }
  [System.IO.File]::WriteAllText($StateFile, ($state | ConvertTo-Json), $Utf8NoBom)
  Write-Log "=== Listo: $AppName $Version en $($values['APP_URL']) ==="
  exit 0
} catch {
  Write-Log "ERROR: $($_.Exception.Message)"
  try {
    $state = [ordered]@{ ok = $false; version = $Version; error = $_.Exception.Message; date = (Get-Date -Format 's') }
    [System.IO.File]::WriteAllText($StateFile, ($state | ConvertTo-Json), $Utf8NoBom)
  } catch {
    # La carpeta de datos no existe o no se puede escribir.
  }
  exit 1
}
