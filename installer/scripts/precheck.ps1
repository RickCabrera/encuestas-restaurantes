# Comprobación previa: el Setup.exe la corre antes de copiar archivos. No depende de
# common.ps1 porque todavía no hay nada instalado.
#
# Códigos de salida: 0 todo bien, 3 puerto de la app ocupado (en -InfoFile queda por quién),
# 4 hay base pero falta el .env, 5 la base es de otra versión mayor de PostgreSQL.
param(
  [int]$AppPort = 3000,
  [string]$PgMajor = '',
  [string]$InfoFile = ''
)

$ErrorActionPreference = 'Stop'
$dataDir = Join-Path $env:ProgramData 'SobremesaEncuestas'
$pgVersionFile = Join-Path $dataDir 'pgdata\PG_VERSION'

function Write-Info([string]$Text) {
  if ($InfoFile) { [System.IO.File]::WriteAllText($InfoFile, $Text, [System.Text.Encoding]::Default) }
}

try {
  # Actualización: se detienen la app y la base antes de reemplazar sus archivos.
  foreach ($name in @('SobremesaEncuestasApp', 'SobremesaEncuestasDB')) {
    $service = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($service -and $service.Status -ne 'Stopped') {
      Stop-Service -Name $name -Force -ErrorAction SilentlyContinue
      (Get-Service -Name $name).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(120))
    }
  }

  if (Test-Path $pgVersionFile) {
    if (-not (Test-Path (Join-Path $dataDir '.env')) -and -not (Test-Path (Join-Path $dataDir 'instalacion-incompleta.flag'))) { exit 4 }
    $dataMajor = ([System.IO.File]::ReadAllText($pgVersionFile)).Trim()
    if ($PgMajor -and $dataMajor -ne $PgMajor) {
      Write-Info $dataMajor
      exit 5
    }
  }

  $listener = Get-NetTCPConnection -State Listen -LocalPort $AppPort -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) {
    $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    $who = if ($process) { "$($process.ProcessName) (PID $($listener.OwningProcess))" } else { "PID $($listener.OwningProcess)" }
    Write-Info $who
    exit 3
  }
  exit 0
} catch {
  Write-Info $_.Exception.Message
  exit 1
}
