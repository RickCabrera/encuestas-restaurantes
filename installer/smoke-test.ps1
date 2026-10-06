# Prueba de humo del Setup.exe. INSTALA servicios y PostgreSQL en la maquina donde corre:
# es para el runner de GitHub Actions (.github/workflows/instalador-pc.yml), no para tu PC.
#
# Instala, comprueba, instala encima (actualizacion), desinstala conservando datos,
# reinstala sobre esos datos y al final borra todo.
param(
  [Parameter(Mandatory = $true)][string]$Setup,
  [Parameter(Mandatory = $true)][string]$Version
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Setup = (Resolve-Path $Setup).Path
$Data = Join-Path $env:ProgramData 'SobremesaEncuestas'
$App = Join-Path $env:ProgramFiles 'Sobremesa Encuestas'
$Logs = Join-Path $(if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }) 'instalador-logs'
New-Item -ItemType Directory -Force -Path $Logs | Out-Null
$AdminsAndSystem = @('S-1-5-18', 'S-1-5-32-544')

function Check([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw "FALLO: $Message" }
  Write-Host "  ok  $Message"
}

function Section([string]$Text) { Write-Host "`n=== $Text ===" }

function Invoke-Setup([string]$Name) {
  $p = Start-Process -FilePath $Setup -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/LOG=$Logs\$Name.log") -Wait -PassThru
  Check ($p.ExitCode -eq 0) "Setup ($Name) termina con codigo 0 (fue $($p.ExitCode))"
}

function Invoke-Uninstall {
  $uninstaller = Join-Path $App 'unins000.exe'
  Check (Test-Path $uninstaller) 'Existe el desinstalador'
  Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART') -Wait
  for ($i = 0; $i -lt 60 -and (Test-Path $uninstaller); $i++) { Start-Sleep -Seconds 2 }
  Check (-not (Test-Path $uninstaller)) 'El desinstalador termino'
}

function Read-Env {
  $values = @{}
  foreach ($line in [System.IO.File]::ReadAllLines((Join-Path $Data '.env'))) {
    if ($line -match '^([A-Z_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2] }
  }
  return $values
}

function Invoke-Sql([string]$Sql) {
  $values = Read-Env
  $env:PGPASSWORD = $values['LOCAL_DB_PASSWORD']
  try {
    $out = & (Join-Path $App 'pgsql\bin\psql.exe') -h 127.0.0.1 -p $values['LOCAL_DB_PORT'] -U $values['LOCAL_DB_USER'] -d $values['LOCAL_DB_NAME'] -v ON_ERROR_STOP=1 -tA -c $Sql
    if ($LASTEXITCODE -ne 0) { throw "psql fallo: $Sql" }
    return ($out | Out-String).Trim()
  } finally {
    $env:PGPASSWORD = $null
  }
}

function Get-Sids([string]$Path) {
  return @((Get-Acl -Path $Path).Access | ForEach-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value } | Sort-Object -Unique)
}

function Check-OnlyAdmins([string]$Path) {
  $sids = Get-Sids $Path
  $extra = @($sids | Where-Object { $AdminsAndSystem -notcontains $_ })
  Check ($extra.Count -eq 0) "$Path solo lo leen Administradores y SYSTEM ($($sids -join ', '))"
}

function Check-Running([bool]$IsUpdate) {
  $state = Get-Content (Join-Path $Data 'instalacion-estado.json') -Raw | ConvertFrom-Json
  Check ($state.ok -eq $true) "install.ps1 termino bien ($($state.error))"
  Check ($state.version -eq $Version) "Version instalada $($state.version)"
  Check ($state.update -eq $IsUpdate) "Detectado como actualizacion: $IsUpdate"

  $health = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/health'
  Check ($health.StatusCode -eq 200 -and ($health.Content | ConvertFrom-Json).status -eq 'ok') '/api/health responde {"status":"ok"}'
  $healthDb = (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/health?db=1').Content | ConvertFrom-Json
  Check ($healthDb.db -eq 'ok') '/api/health?db=1 llega a la base'

  $login = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/login'
  Check (-not $login.Headers.ContainsKey('Strict-Transport-Security')) 'Sin HSTS (modo local)'
  Check ($login.Headers.ContainsKey('Content-Security-Policy')) 'Con Content-Security-Policy'

  $services = @{ SobremesaEncuestasDB = 'NT AUTHORITY\NetworkService'; SobremesaEncuestasApp = 'NT AUTHORITY\LocalService' }
  foreach ($name in $services.Keys) {
    $service = Get-CimInstance Win32_Service -Filter "Name='$name'"
    Check ($null -ne $service -and $service.State -eq 'Running') "Servicio $name en ejecucion"
    Check ($service.StartMode -eq 'Auto') "Servicio $name con inicio automatico"
    Check ($service.StartName -eq $services[$name]) "Servicio $name corre como $($service.StartName)"
  }

  $values = Read-Env
  $pgListeners = @(Get-NetTCPConnection -State Listen -LocalPort ([int]$values['LOCAL_DB_PORT']))
  Check ($pgListeners.Count -ge 1 -and @($pgListeners | Where-Object { $_.LocalAddress -ne '127.0.0.1' }).Count -eq 0) "PostgreSQL escucha solo en 127.0.0.1:$($values['LOCAL_DB_PORT'])"
  Check ([int]$values['LOCAL_DB_PORT'] -ne 5432) 'PostgreSQL no usa el puerto estandar'
  Check ($values['APP_MODE'] -eq 'local') 'APP_MODE=local en el .env'
  Check ($values['AUTH_SECRET'].Length -ge 64) 'AUTH_SECRET aleatorio y largo'
  Check ($values['LOCAL_DB_PASSWORD'].Length -ge 32) 'Contrasena de base aleatoria'
  Check ($values['APP_URL'] -match '^http://\d+\.\d+\.\d+\.\d+:3000$') "APP_URL usa la IP de la PC ($($values['APP_URL']))"

  $rule = Get-NetFirewallRule -Name 'SobremesaEncuestas-HTTP'
  Check ($rule.Enabled -eq 'True' -and $rule.Direction -eq 'Inbound' -and $rule.Action -eq 'Allow') 'Regla de firewall de entrada activa'
  Check ([string]$rule.Profile -eq 'Private') "Regla de firewall solo para red privada ($($rule.Profile))"
  Check (($rule | Get-NetFirewallPortFilter).LocalPort -eq '3000') 'Regla de firewall en el puerto 3000'

  $task = Get-ScheduledTask -TaskName 'Sobremesa Encuestas - Respaldo diario'
  Check ($task.Triggers[0].CimClass.CimClassName -eq 'MSFT_TaskDailyTrigger') 'Tarea programada diaria de respaldo'
  Check ($task.Principal.UserId -eq 'SYSTEM') 'La tarea de respaldo corre como SYSTEM'

  Check-OnlyAdmins (Join-Path $Data 'backups')
  Check-OnlyAdmins (Join-Path $Data 'listo.html')
  Check-OnlyAdmins (Join-Path $Data 'secretos')
  $envSids = Get-Sids (Join-Path $Data '.env')
  Check (@($envSids | Where-Object { ($AdminsAndSystem + 'S-1-5-19') -notcontains $_ }).Count -eq 0) ".env: Administradores, SYSTEM y la cuenta de la app ($($envSids -join ', '))"

  $listo = Get-Content (Join-Path $Data 'listo.json') -Raw | ConvertFrom-Json
  Check ($listo.version -eq $Version) 'La pagina Listo muestra la version'
  Check ($listo.tabletUrl -eq $values['APP_URL']) 'La pagina Listo muestra la direccion de las tablets'
  Check ((Get-Content (Join-Path $Data 'listo.html') -Raw) -match [regex]::Escape($Version)) 'listo.html trae la version'
  Check (Test-Path (Join-Path $Data 'energia-anterior.json')) 'Se guardo la configuracion de suspension anterior'
}

try {
  Section '1. Instalacion nueva'
  Check (-not (Test-Path (Join-Path $Data 'pgdata\PG_VERSION'))) 'La maquina empieza sin datos'
  Invoke-Setup 'instalar'
  Check-Running $false
  Check ((Invoke-Sql 'select count(*) from users') -eq '0') 'Sin usuarios: no se corrio el seed'
  Check ([int](Invoke-Sql 'select count(*) from drizzle.__drizzle_migrations') -ge 3) 'Migraciones aplicadas'
  $listo = Get-Content (Join-Path $Data 'listo.json') -Raw | ConvertFrom-Json
  $appUrl = (Read-Env)['APP_URL']
  Check ($listo.inviteLink -match ('^' + [regex]::Escape($appUrl) + '/registro\?codigo=[A-Za-z0-9_-]{43}$')) 'Enlace de alta de un solo uso con la IP de la PC'
  $signup = Invoke-WebRequest -UseBasicParsing -Uri ($listo.inviteLink -replace [regex]::Escape($appUrl), 'http://127.0.0.1:3000')
  Check ($signup.StatusCode -eq 200) 'El enlace de alta abre la pagina de registro'

  Section '2. Respaldo'
  & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $App 'tools\backup.ps1')
  Check ($LASTEXITCODE -eq 0) 'backup.ps1 termina bien'
  $dumps = @(Get-ChildItem (Join-Path $Data 'backups') -Filter 'encuestas-*.dump')
  Check ($dumps.Count -eq 1 -and $dumps[0].Length -gt 0) "Respaldo creado ($($dumps[0].Name))"
  # Rotacion: con 16 copias viejas de mentira deben quedar 14, y la real entre ellas.
  Start-Sleep -Seconds 2
  1..16 | ForEach-Object { Set-Content -Path (Join-Path $Data ("backups\encuestas-200001{0:d2}-000000.dump" -f $_)) -Value 'x' }
  & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $App 'tools\backup.ps1')
  $dumps = @(Get-ChildItem (Join-Path $Data 'backups') -Filter 'encuestas-*.dump')
  Check ($dumps.Count -eq 14) "Se conservan 14 respaldos (hay $($dumps.Count))"
  Check (@($dumps | Where-Object { $_.Length -gt 10 }).Count -eq 2) 'Los dos respaldos reales siguen ahi'

  Section '3. Herramientas'
  & (Join-Path $App 'node\node.exe') "--env-file=$Data\.env" (Join-Path $App 'tools\js\reset-admin-password.cjs') --list
  Check ($LASTEXITCODE -eq 0) 'reset-admin-password --list'
  & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $App 'tools\actualizar-ip.ps1') -Yes
  Check ($LASTEXITCODE -eq 0) 'actualizar-ip.ps1 (sin cambio de IP)'

  Section '4. Actualizacion: instalar encima conserva la base y el .env'
  Invoke-Sql 'create table zz_prueba_humo (nota text); insert into zz_prueba_humo values (''sigo aqui'')' | Out-Null
  $envHash = (Get-FileHash (Join-Path $Data '.env')).Hash
  $invites = Invoke-Sql 'select count(*) from signup_invites'
  Invoke-Setup 'actualizar'
  Check-Running $true
  Check ((Get-FileHash (Join-Path $Data '.env')).Hash -eq $envHash) 'El .env no cambio'
  Check ((Invoke-Sql 'select nota from zz_prueba_humo') -eq 'sigo aqui') 'La base no se recreo: los datos siguen'
  Check ([int](Invoke-Sql 'select count(*) from signup_invites') -ge [int]$invites) 'Las invitaciones anteriores siguen'
  Check (@(Get-ChildItem (Join-Path $Data 'backups') -Filter 'antes-de-actualizar-*.dump').Count -eq 1) 'Respaldo de seguridad antes de actualizar'

  Section '5. Desinstalar conservando datos'
  Invoke-Uninstall
  Check (-not (Get-Service -Name 'SobremesaEncuestasApp', 'SobremesaEncuestasDB' -ErrorAction SilentlyContinue)) 'Servicios eliminados'
  Check (-not (Get-NetFirewallRule -Name 'SobremesaEncuestas-HTTP' -ErrorAction SilentlyContinue)) 'Regla de firewall eliminada'
  Check (-not (Get-ScheduledTask -TaskName 'Sobremesa Encuestas - Respaldo diario' -ErrorAction SilentlyContinue)) 'Tarea de respaldo eliminada'
  Check (-not (Test-Path (Join-Path $Data 'energia-anterior.json'))) 'Suspension restaurada'
  Check ((Test-Path (Join-Path $Data 'pgdata\PG_VERSION')) -and (Test-Path (Join-Path $Data '.env'))) 'Los datos se conservaron'
  Check (-not (Test-Path (Join-Path $App 'app\server.js'))) 'El programa se quito'

  Section '6. Reinstalar sobre los datos conservados'
  Invoke-Setup 'reinstalar'
  Check-Running $true
  Check ((Invoke-Sql 'select nota from zz_prueba_humo') -eq 'sigo aqui') 'La reinstalacion uso la base que ya existia'

  Section '7. Desinstalar borrando datos'
  & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $App 'tools\uninstall.ps1') -RemoveData
  Check ($LASTEXITCODE -eq 0) 'uninstall.ps1 -RemoveData termina bien'
  Check (-not (Test-Path $Data)) 'La carpeta de datos se borro'
  Invoke-Uninstall

  Write-Host "`nPrueba de humo completa."
} catch {
  Write-Host "`n$($_.Exception.Message)"
  Write-Host $_.ScriptStackTrace
  foreach ($file in @((Join-Path $Data 'logs\instalacion.log'), (Join-Path $Data 'logs\respaldo.log'))) {
    if (Test-Path $file) { Write-Host "`n--- $file"; Get-Content $file -Tail 60 }
  }
  Copy-Item (Join-Path $Data 'logs') (Join-Path $Logs 'datos') -Recurse -ErrorAction SilentlyContinue
  exit 1
}
