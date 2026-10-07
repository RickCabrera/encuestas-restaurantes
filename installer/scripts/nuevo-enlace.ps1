# Acceso directo "Generar enlace de alta nuevo": crea otro enlace de un solo uso para dar
# de alta una cadena con su usuario maestro, y lo muestra en la página "Listo".
. (Join-Path $PSScriptRoot 'common.ps1')
Request-Elevation $PSCommandPath

try {
  Write-Host 'Generando un enlace de alta nuevo...'
  Start-ServiceAndWait $DbService
  Wait-Database (Read-EnvFile)['LOCAL_DB_PORT']
  $link = New-OrgInviteLink
  Update-ListoPage $link
  Write-Log 'Se generó un enlace de alta nuevo.'
  & (Join-Path $PSScriptRoot 'ver-listo.ps1')
} catch {
  Write-Host ''
  Write-Host "No se pudo generar el enlace: $($_.Exception.Message)"
  Read-Host 'Presiona Enter para cerrar' | Out-Null
  exit 1
}
