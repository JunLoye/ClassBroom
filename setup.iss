[Setup]
AppId=ClassBroom
AppName=ClassBroom
AppVersion=2.2.1
VersionInfoDescription=ClassBroom - 桌面课程与天气挂件
VersionInfoProductName=ClassBroom
VersionInfoCompany=JunLoye
VersionInfoCopyright=Copyright © 2026 JunLoye
SetupIconFile=www\app.ico
AppPublisher=ClassBroom
AppPublisherURL=https://github.com/your-repo/ClassBroom
AppSupportURL=https://github.com/your-repo/ClassBroom
AppUpdatesURL=https://github.com/your-repo/ClassBroom

DefaultDirName={autopf}\ClassBroom
DefaultGroupName=ClassBroom
DisableProgramGroupPage=yes

OutputDir=installer
OutputBaseFilename=ClassBroom-Setup-v2.2.1
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern

PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "dist\classbroom\classbroom-win_x64.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\classbroom\classbroom-crypto.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\classbroom\resources.neu"; DestDir: "{app}"; Flags: ignoreversion
Source: "www\app.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "www\tray.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\classbroom\WebView2Loader.dll"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{group}\ClassBroom"; Filename: "{app}\classbroom-win_x64.exe"; IconFilename: "{app}\app.ico"
Name: "{autodesktop}\ClassBroom"; Filename: "{app}\classbroom-win_x64.exe"; IconFilename: "{app}\app.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\classbroom-win_x64.exe"; Description: "{cm:LaunchProgram,ClassBroom}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\.tmp"
Type: filesandordirs; Name: "{app}\logs"