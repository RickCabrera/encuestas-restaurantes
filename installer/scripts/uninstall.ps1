# Lo corre el desinstalador antes de borrar los archivos del programa.
# Con -RemoveData también borra la base, el .env y los respaldos; sin él, se conservan
# (y una instalación posterior los vuelve a usar).
param(
  [switch]$RemoveData
)

. (Join-Path $PSScriptRoot 'common.ps1')
$Sc = Join-Path $env:SystemRoot 'System32\sc.exe'

try {
  Write-Log "=== Desinstalación de $AppName (borrar datos: $([bool]$RemoveData)) ==="
  try { Stop-AppServices } catch { Write-Log "Aviso: $($_.Exception.Message)" }
  foreach ($name in @($AppService, $DbService)) {
    if (Test-ServiceExists $name) {
      $wrapper = Join-Path $ServiceDir "$name.exe"
      $removed = $false
      if (Test-Path $wrapper) { $removed = ((Invoke-Native -File $wrapper -Arguments @('uninstall')).ExitCode -eq 0) }
      if (-not $removed) { Invoke-Native -File $Sc -Arguments @('delete', $name) | Out-Null }
    }
  }
  Get-NetFirewallRule -Name $FirewallRule -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  Unregister-ScheduledTask -TaskName $BackupTask -Confirm:$false -ErrorAction SilentlyContinue
  Restore-AcSleep

  if ($RemoveData) {
    # Los procesos de PostgreSQL pueden tardar un momento en soltar sus archivos.
    for ($i = 0; $i -lt 5 -and (Test-Path $DataDir); $i++) {
      Remove-Item -Path $DataDir -Recurse -Force -ErrorAction SilentlyContinue
      if (Test-Path $DataDir) { Start-Sleep -Seconds 2 }
    }
  } else {
    Write-Log "Se conservan los datos en $DataDir."
  }
  exit 0
} catch {
  try { Write-Log "ERROR al desinstalar: $($_.Exception.Message)" } catch { }
  exit 1
}
