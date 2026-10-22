/* Startup: draw the interface right away, then fill in saved folders and tags from the desktop app. */
async function boot() {
  if (desktop?.appInfo) {
    try {
      APP_VERSION = (await callDesktop(desktop.appInfo)).version || APP_VERSION;
    } catch {}
  }
  await loadRoutes();
  if (routeRecords.mods?.path) await loadModCatalog();
  render();
  offerSharedCollection();
}

render();
boot();
