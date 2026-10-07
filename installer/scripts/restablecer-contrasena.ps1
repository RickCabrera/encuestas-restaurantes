# Acceso directo "Restablecer contraseña de administrador". En la versión instalada no hay
# correo de recuperación: quien tenga permisos de administrador de Windows en esta PC puede
# poner una contraseña nueva a un administrador del panel.
. (Join-Path $PSScriptRoot 'common.ps1')
Request-Elevation $PSCommandPath

function Read-Plain([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

try {
  Write-Host "$AppName - Restablecer contraseña de administrador"
  Write-Host ''
  Start-ServiceAndWait $DbService
  Wait-Database (Read-EnvFile)['LOCAL_DB_PORT']

  $list = Invoke-Tool 'reset-admin-password.cjs' @('--list')
  if ($list.ExitCode -ne 0) { throw "No se pudo consultar a los administradores. $($list.Error)" }
  Write-Host $list.Output
  Write-Host ''

  $email = (Read-Host 'Correo del administrador').Trim()
  if (-not $email) { throw 'No escribiste un correo.' }
  $password = Read-Plain 'Contraseña nueva (mínimo 8 caracteres)'
  $again = Read-Plain 'Repite la contraseña'
  if ($password -cne $again) { throw 'Las contraseñas no coinciden.' }

  # La contraseña viaja por variable de entorno, no por la línea de comandos.
  $r = Invoke-Tool 'reset-admin-password.cjs' @($email) @{ RESET_PASSWORD = $password }
  Write-Host ''
  if ($r.ExitCode -ne 0) { throw "$($r.Error) $($r.Output)".Trim() }
  Write-Host $r.Output
  Write-Log "Se restableció la contraseña de un administrador."
} catch {
  Write-Host ''
  Write-Host "No se cambió nada: $($_.Exception.Message)"
}
Write-Host ''
Read-Host 'Presiona Enter para cerrar' | Out-Null
