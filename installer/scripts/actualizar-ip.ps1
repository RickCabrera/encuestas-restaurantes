# Acceso directo "Actualizar la IP": si la IP de la PC cambió, pone la nueva en APP_URL
# (la usan los QR y los enlaces) y reinicia la app. Las tablets y los QR ya impresos
# siguen apuntando a la IP anterior: ver docs/INSTALAR-PC.md.
param(
  # Sin preguntas (para pruebas automáticas).
  [switch]$Yes
)

. (Join-Path $PSScriptRoot 'common.ps1')
Request-Elevation $PSCommandPath

try {
  $values = Read-EnvFile
  $lan = Get-LanInfo
  if (-not $lan.Ip) { throw 'Esta PC no tiene red. Conéctala y vuelve a intentar.' }
  $new = "http://$($lan.Ip):$AppPort"
  Write-Host "Dirección configurada: $($values['APP_URL'])"
  Write-Host "Dirección actual:      $new  ($($lan.Alias))"
  Write-Host ''
  if ($values['APP_URL'] -eq $new) {
    Write-Host 'La IP no cambió. No hay nada que hacer.'
  } else {
    $answer = if ($Yes) { 's' } else { Read-Host '¿Usar la dirección actual? (s/n)' }
    if ($answer -match '^[sSyY]') {
      $values['APP_URL'] = $new
      Write-EnvFile $values
      Restart-Service -Name $AppService -Force
      Wait-App
      Write-Log "APP_URL actualizada a $new."
      Write-Host ''
      Write-Host 'Listo. Falta, a mano:'
      Write-Host "  1. En cada tablet: mantén presionada la esquina superior izquierda, escribe el PIN y cambia el servidor a $new"
      Write-Host '  2. Vuelve a imprimir los QR de mesa: los anteriores llevan la IP vieja.'
    } else {
      Write-Host 'No se cambió nada.'
    }
  }
  Update-ListoPage
} catch {
  Write-Host "No se pudo actualizar: $($_.Exception.Message)"
  if ($Yes) { exit 1 }
}
if (-not $Yes) {
  Write-Host ''
  Read-Host 'Presiona Enter para cerrar' | Out-Null
}
