# Respaldo de la base con pg_dump. Lo corre a diario la tarea programada (como SYSTEM) y
# conserva las 14 copias más recientes. El instalador también lo usa antes de actualizar.
#
# Restaurar: docs/INSTALAR-PC.md, sección "Restaurar un respaldo".
param(
  [string]$Prefix = 'encuestas',
  [int]$Keep = 14
)

. (Join-Path $PSScriptRoot 'common.ps1')

try {
  if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null }
  $values = Read-EnvFile
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $final = Join-Path $BackupDir "$Prefix-$stamp.dump"
  $partial = "$final.parcial"

  $arguments = (Get-DbArgs $values) + @('-Fc', '-f', $partial, $values['LOCAL_DB_NAME'])
  $r = Invoke-Native -File (Join-Path $PgBin 'pg_dump.exe') -Arguments $arguments -Environment (Get-DbEnvironment $values)
  if ($r.ExitCode -ne 0 -or -not (Test-Path $partial) -or (Get-Item $partial).Length -eq 0) {
    Remove-Item -Path $partial -Force -ErrorAction SilentlyContinue
    throw "pg_dump falló (código $($r.ExitCode)). $($r.Error)"
  }
  Move-Item -Path $partial -Destination $final -Force

  # Las copias viejas solo se borran después de que la nueva salió bien.
  Get-ChildItem -Path $BackupDir -Filter "$Prefix-*.dump" | Sort-Object Name -Descending | Select-Object -Skip $Keep | Remove-Item -Force
  Write-Log "Respaldo creado: $final" 'respaldo.log'
  exit 0
} catch {
  Write-Log "ERROR en el respaldo: $($_.Exception.Message)" 'respaldo.log'
  exit 1
}
