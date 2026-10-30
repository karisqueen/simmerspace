/* Startup: draw the interface right away, then fill in saved folders, tags and integration status from the desktop app. */
async function boot() {
  if (desktop?.appInfo) {
    try {
      const info = await callDesktop(desktop.appInfo);
      APP_VERSION = info.version || APP_VERSION;
      state.appInfo = { developer: info.developer === true };
    } catch {}
  }
  await Promise.all([loadRoutes(), loadIntegrationStatus(), loadAccountStatus()]);
  if (routeRecords.mods?.path) await loadModCatalog();
  render();
  offerSharedCollection();
}

render();
boot();
