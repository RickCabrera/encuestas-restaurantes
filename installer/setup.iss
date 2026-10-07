; Instalador de Windows de Sobremesa Encuestas (Inno Setup 6).
; Lo compila installer/build.ps1, que pasa AppVersion, PgMajor, PayloadDir y OutputDir.
; La configuración de la PC la hace tools\install.ps1; aquí solo se copian archivos y se le llama.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef PgMajor
  #define PgMajor "17"
#endif
#ifndef PayloadDir
  #define PayloadDir "build\payload"
#endif
#ifndef OutputDir
  #define OutputDir "build\out"
#endif
#ifndef IconFile
  #define IconFile "assets\sobremesa.ico"
#endif

#define AppName "Sobremesa Encuestas"
#define PowerShell "{sys}\WindowsPowerShell\v1.0\powershell.exe"
#define PsFile "-NoProfile -ExecutionPolicy Bypass -File"

[Setup]
; No cambiar el AppId: es lo que hace que un Setup.exe nuevo actualice la instalación existente.
AppId={{6F0B9C1E-3D5A-4E7B-9A54-2C8D1F7E4B10}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=SITIRT
VersionInfoVersion={#AppVersion}
; Carpeta fija: los servicios de Windows quedan registrados con esta ruta.
DefaultDirName={autopf}\Sobremesa Encuestas
DisableDirPage=yes
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir={#OutputDir}
OutputBaseFilename=SobremesaEncuestas-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
SetupLogging=yes
UninstallDisplayName={#AppName}
SetupIconFile={#IconFile}
UninstallDisplayIcon={app}\SobremesaEncuestas.exe

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[InstallDelete]
; Los archivos del programa de la versión anterior. Los datos viven en ProgramData y no se tocan.
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\node"
Type: filesandordirs; Name: "{app}\pgsql"
Type: filesandordirs; Name: "{app}\tools"
; El acceso "Abrir el panel" de las primeras versiones: lo reemplaza el lanzador.
Type: files; Name: "{app}\Panel.url"
Type: files; Name: "{group}\Abrir el panel.lnk"

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "{#PayloadDir}\tools\precheck.ps1"; Flags: dontcopy

[Icons]
; El programa: abre el sistema en su propia ventana. No pide permisos de administrador.
Name: "{group}\Sobremesa Encuestas"; Filename: "{app}\SobremesaEncuestas.exe"
Name: "{autodesktop}\Sobremesa Encuestas"; Filename: "{app}\SobremesaEncuestas.exe"
Name: "{group}\Datos de la instalación (Listo)"; Filename: "{#PowerShell}"; Parameters: "-WindowStyle Hidden {#PsFile} ""{app}\tools\ver-listo.ps1"""
Name: "{group}\Generar enlace de alta nuevo"; Filename: "{#PowerShell}"; Parameters: "{#PsFile} ""{app}\tools\nuevo-enlace.ps1"""
Name: "{group}\Restablecer contraseña de administrador"; Filename: "{#PowerShell}"; Parameters: "{#PsFile} ""{app}\tools\restablecer-contrasena.ps1"""
Name: "{group}\Actualizar la IP"; Filename: "{#PowerShell}"; Parameters: "{#PsFile} ""{app}\tools\actualizar-ip.ps1"""

[Run]
Filename: "{app}\SobremesaEncuestas.exe"; Description: "Abrir Sobremesa Encuestas"; Flags: postinstall nowait skipifsilent; Check: InstallSucceeded
; Página "Listo". Se abre con permisos de administrador porque solo ellos pueden leerla.
Filename: "{#PowerShell}"; Parameters: "-WindowStyle Hidden {#PsFile} ""{app}\tools\ver-listo.ps1"""; Description: "Ver los datos de la instalación (IP, dirección para las tablets y enlace de alta)"; Flags: postinstall nowait skipifsilent runascurrentuser; Check: InstallSucceeded

[UninstallDelete]
Type: filesandordirs; Name: "{app}\services"

[Code]
var
  ConfigOk: Boolean;
  RemoveData: Boolean;

function PowerShellPath: String;
begin
  Result := ExpandConstant('{#PowerShell}');
end;

function InstallSucceeded: Boolean;
begin
  Result := ConfigOk;
end;

procedure StartServices;
var
  Code: Integer;
begin
  Exec(ExpandConstant('{sys}\sc.exe'), 'start SobremesaEncuestasDB', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Exec(ExpandConstant('{sys}\sc.exe'), 'start SobremesaEncuestasApp', '', SW_HIDE, ewWaitUntilTerminated, Code);
end;

{ Antes de copiar archivos: detiene los servicios (actualización) y revisa que se pueda instalar. }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
  InfoFile: String;
  Info: AnsiString;
begin
  Result := '';
  ExtractTemporaryFile('precheck.ps1');
  InfoFile := ExpandConstant('{tmp}\precheck.txt');
  if not Exec(PowerShellPath, '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\precheck.ps1') +
    '" -AppPort 3000 -PgMajor {#PgMajor} -InfoFile "' + InfoFile + '"', '', SW_HIDE, ewWaitUntilTerminated, Code) then
  begin
    Result := 'No se pudo ejecutar Windows PowerShell, que el instalador necesita.';
    exit;
  end;
  Info := '';
  LoadStringFromFile(InfoFile, Info);
  case Code of
    0: ;
    3:
      if SuppressibleMsgBox('El puerto 3000 de esta PC ya lo está usando otro programa: ' + String(Info) + '.' + #13#10#13#10 +
        'Sobremesa Encuestas necesita ese puerto. Cierra ese programa (o desinstálalo) y vuelve a instalar.' + #13#10#13#10 +
        '¿Continuar de todos modos? Si el puerto sigue ocupado, la aplicación no va a arrancar.',
        mbError, MB_YESNO or MB_DEFBUTTON2, IDNO) <> IDYES then
      begin
        StartServices;
        Result := 'El puerto 3000 está ocupado por ' + String(Info) + '. No se instaló nada.';
      end;
    4:
      Result := 'Hay una base de datos de Sobremesa Encuestas en esta PC pero falta su archivo de configuración (.env). ' +
        'No se tocó nada. Restaura C:\ProgramData\SobremesaEncuestas\.env y vuelve a instalar.';
    5:
      begin
        StartServices;
        Result := 'La base de datos de esta PC es de PostgreSQL ' + String(Info) + ' y este instalador trae PostgreSQL {#PgMajor}. ' +
          'No se tocó nada. Pide un instalador de migración.';
      end;
  else
    Result := 'La comprobación previa falló (código ' + IntToStr(Code) + '). ' + String(Info);
  end;
end;

{ Después de copiar archivos: base, migraciones, servicios, firewall, respaldo y página "Listo". }
procedure CurStepChanged(CurStep: TSetupStep);
var
  Code: Integer;
begin
  if CurStep <> ssPostInstall then
    exit;
  WizardForm.StatusLabel.Caption := 'Configurando la base de datos y los servicios. Puede tardar unos minutos...';
  WizardForm.FilenameLabel.Caption := '';
  ConfigOk := Exec(PowerShellPath, '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\tools\install.ps1') +
    '" -Version {#AppVersion}', '', SW_HIDE, ewWaitUntilTerminated, Code) and (Code = 0);
  if not ConfigOk then
    SuppressibleMsgBox('Los archivos se copiaron, pero la configuración no terminó.' + #13#10#13#10 +
      'El motivo está al final de:' + #13#10 + 'C:\ProgramData\SobremesaEncuestas\logs\instalacion.log' + #13#10#13#10 +
      'Tus datos no se borraron. Corrige el problema y vuelve a ejecutar este instalador.', mbError, MB_OK, IDOK);
end;

{ Desinstalar: pregunta si se conservan los datos. En silencio, siempre se conservan. }
function InitializeUninstall: Boolean;
begin
  Result := True;
  RemoveData := False;
  if UninstallSilent then
    exit;
  if MsgBox('¿Quieres CONSERVAR los datos de Sobremesa Encuestas en esta PC?' + #13#10#13#10 +
    'Sí: se quita el programa pero se quedan la base de datos, la configuración y los respaldos en C:\ProgramData\SobremesaEncuestas. Si lo vuelves a instalar, todo sigue ahí.' + #13#10#13#10 +
    'No: se borra todo, incluidas las encuestas respondidas y los respaldos.', mbConfirmation, MB_YESNO) = IDNO then
    RemoveData := MsgBox('Se van a BORRAR todas las encuestas, usuarios y respaldos de esta PC. No se puede deshacer.' + #13#10#13#10 +
      '¿Borrar los datos?', mbError, MB_YESNO or MB_DEFBUTTON2) = IDYES;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Code: Integer;
  Params: String;
begin
  if CurUninstallStep <> usUninstall then
    exit;
  Params := '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\tools\uninstall.ps1') + '"';
  if RemoveData then
    Params := Params + ' -RemoveData';
  Exec(PowerShellPath, Params, '', SW_HIDE, ewWaitUntilTerminated, Code);
end;
