# Configurar las cuentas de SimmerSpace (Supabase, plan gratuito)

Las cuentas son **opcionales**. Sin configurarlas, SimmerSpace funciona en modo invitado y no contacta ningún servidor. La cuenta de SimmerSpace es independiente de CurseForge.

## 1. Crear el proyecto

1. Crea una cuenta en <https://supabase.com> y un proyecto nuevo (plan Free).
2. En **Project Settings → API** copia la **Project URL** (`https://<ref>.supabase.co`) y la clave **anon** o **publishable**. Las dos son públicas por diseño; los datos se protegen con RLS. **Nunca** uses la clave `service_role` / secret en la app.

## 2. Crear las tablas (migración con RLS)

Con la CLI de Supabase, desde la carpeta del proyecto:

```bash
supabase link --project-ref <ref>
supabase db push
```

O copia `supabase/migrations/20261025000000_simmerspace_accounts.sql` en **SQL Editor** y ejecútalo. Crea `profiles`, `user_settings` y `collections`, activa RLS en las tres (cada persona solo puede leer y cambiar sus filas) y un disparador que crea el perfil al registrarse.

Prueba local opcional de la RLS en un PostgreSQL normal: ejecuta `supabase/tests/local-auth-stub.sql`, después la migración y después `supabase/tests/rls-check.sql` (termina con “RLS checks passed”).

## 3. Ajustes de autenticación

En **Authentication**:

- **Sign In / Providers → Email**: activado, con **Confirm email** activado.
- **Email Templates**: SimmerSpace usa **códigos**, no enlaces. En **Confirm signup** y en **Reset password** incluye `{{ .Token }}` en el texto, por ejemplo: `Tu código de SimmerSpace es {{ .Token }}`.
- **URL Configuration**: como se usan códigos, no hace falta ninguna URL de redirección para la app de escritorio. Deja la Site URL por defecto o pon la web del proyecto.
- **SMTP**: el servicio de correo incluido en el plan gratuito solo envía unos pocos correos por hora y está pensado para pruebas. Para usuarios reales configura un SMTP propio en **Project Settings → Authentication → SMTP**.

## 4. Conectar la app

Elige una opción (orden de prioridad: variables de entorno, archivo local, archivo empaquetado):

- Variables de entorno: `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
- `simmerspace.config.json` en la carpeta de datos de la app (ver `simmerspace.config.example.json`).
- Para una compilación que vas a repartir: copia `electron/public-config.example.json` a `electron/public-config.json` con la URL y la clave anon. Solo valores públicos; este archivo está en `.gitignore`.

## 5. Probar

**En local:** `pnpm start`, abre **Cuenta de SimmerSpace** (abajo en la barra lateral), crea una cuenta con un correo real, introduce el código recibido, inicia sesión, cambia el nombre, pulsa **Sincronizar ahora** y comprueba en **Table Editor** que solo aparecen tus filas. Prueba también “¿Olvidaste tu contraseña?”. Puedes usar `SIMMERSPACE_PROFILE_DIR` para no tocar tus datos normales.

**En una compilación:** pon `electron/public-config.json` antes de `pnpm dist:portable`, abre el .exe en otro PC o perfil y repite las pruebas. Cierra y vuelve a abrir la app para comprobar que la sesión se mantiene.

## Límites del plan gratuito y decisiones de seguridad

- El plan Free permite pocos proyectos activos y **pausa los proyectos inactivos** tras unos días sin uso; hay límites de base de datos, usuarios activos al mes, correos e invocaciones de funciones. Revisa los límites actuales en <https://supabase.com/pricing>.
- La sesión se guarda cifrada con `safeStorage` de Electron (DPAPI en Windows). Si el cifrado no está disponible, la sesión se queda solo en memoria.
- Se sincronizan preferencias, favoritos y colecciones (nombre, color, orden y elementos). **No** se suben rutas de carpetas, etiquetas, archivos escaneados ni portadas.
- Sincronizar fusiona: gana la copia más reciente de cada colección y nunca se borra nada.
- **No verificado** en esta versión contra un proyecto real de Supabase: el registro, los correos y la sincronización se han probado con un cliente simulado y la migración con PostgreSQL 16 local.
