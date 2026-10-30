; Custom NSIS steps for the SimmerSpace installer (electron-builder includes this file automatically).
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
