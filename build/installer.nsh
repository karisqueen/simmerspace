; Custom NSIS steps for the SimmerSpace installer (electron-builder includes this file automatically).
; The installer is short on purpose: welcome, install, done. It installs for the current Windows user only, so
; it never asks for administrator rights and automatic updates can replace the app without a prompt.

!macro customHeader
  !define MUI_FINISHPAGE_TITLE "$(ssFinishTitle)"
  !define MUI_FINISHPAGE_TEXT "$(ssFinishText)"
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "$(ssWelcomeTitle)"
  !define MUI_WELCOMEPAGE_TEXT "$(ssWelcomeText)"
  !insertmacro MUI_PAGE_WELCOME
!macroend

; Skip the "only for me / for everyone" page: always install for the current user.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

LangString ssWelcomeTitle 1033 "Welcome to SimmerSpace"
LangString ssWelcomeText 1033 "Your home for Sims 4 mods and CC.$\r$\n$\r$\nSimmerSpace installs just for your Windows user, without administrator rights. From now on it keeps itself up to date and always asks you first.$\r$\n$\r$\nClick Next to install."
LangString ssFinishTitle 1033 "All set!"
LangString ssFinishText 1033 "SimmerSpace is installed. You'll find it on your desktop and in the Start menu."
LangString ssWelcomeTitle 3082 "Te damos la bienvenida a SimmerSpace"
LangString ssWelcomeText 3082 "Tu espacio para los mods y el CC de Los Sims 4.$\r$\n$\r$\nSimmerSpace se instala solo para tu usuario de Windows, sin pedir permisos de administrador. A partir de ahora se mantiene al día y siempre te pregunta antes.$\r$\n$\r$\nPulsa Siguiente para instalar."
LangString ssFinishTitle 3082 "¡Todo listo!"
LangString ssFinishText 3082 "SimmerSpace ya está instalado. Lo encontrarás en el escritorio y en el menú Inicio."

; Uninstalling signs SimmerSpace out on this PC: the saved session is deleted, but not when the uninstaller only
; runs as part of an update. Settings, tags and collections stay.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    SetShellVarContext current
    Delete "$APPDATA\simmerspace\account-session.json"
    Delete "$APPDATA\SimmerSpace\account-session.json"
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
  ${endIf}
!macroend
