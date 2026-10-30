; ==========================================
; ClassBroom Inno Setup 打包脚本
; ==========================================

[Setup]
; 应用基本信息
AppId=ClassBroom
AppName=ClassBroom
AppVersion=1.3.0
SetupIconFile=www\app.ico
AppPublisher=ClassBroom
AppPublisherURL=https://github.com/your-repo/ClassBroom
AppSupportURL=https://github.com/your-repo/ClassBroom
AppUpdatesURL=https://github.com/your-repo/ClassBroom

; 安装目录设置 (安装到 Program Files\ClassBroom)
DefaultDirName={autopf}\ClassBroom
DefaultGroupName=ClassBroom
DisableProgramGroupPage=yes

; 输出设置
OutputDir=installer
OutputBaseFilename=ClassBroom-Setup-v1.3.0
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern

; 权限设置 (无需管理员权限时设为 lowest)
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

; 架构支持
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; 将 neu build 生成的 dist 目录下的文件打包
; 注意：若你的 neutralino.config.json 的 binaryName 不同，请修改文件名
Source: "dist\classbroom\classbroom-win_x64.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\classbroom\resources.neu"; DestDir: "{app}"; Flags: ignoreversion
Source: "www\app.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "www\tray.ico"; DestDir: "{app}"; Flags: ignoreversion
; 如果存在 WebView2Loader.dll，一并打包（某些旧版 Windows 可能需要）
Source: "dist\classbroom\WebView2Loader.dll"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
; 开始菜单快捷方式
Name: "{group}\ClassBroom"; Filename: "{app}\classbroom-win_x64.exe"; IconFilename: "{app}\app.ico"
; 桌面快捷方式 (由用户在安装界面勾选)
Name: "{autodesktop}\ClassBroom"; Filename: "{app}\classbroom-win_x64.exe"; IconFilename: "{app}\app.ico"; Tasks: desktopicon

[Run]
; 安装完成后运行的选项
Filename: "{app}\classbroom-win_x64.exe"; Description: "{cm:LaunchProgram,ClassBroom}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; 卸载时清理运行时产生的临时文件 (可选)
Type: filesandordirs; Name: "{app}\.tmp"
Type: filesandordirs; Name: "{app}\logs"