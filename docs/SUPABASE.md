# Supabase en SimmerSpace 0.10.0

Desde la 0.10.0 **hace falta una cuenta** para usar SimmerSpace (gestor de mods incluido). Si hay una sesión
guardada en el equipo, se recupera al abrir la app, también sin internet. La cuenta de SimmerSpace es
independiente de CurseForge.

Este documento está escrito para el proyecto real **SimmerSpace** (plan Free), que ya tiene:

| Recurso | Estado esperado |
| --- | --- |
| `public.profiles (id, username, avatar_url, created_at)` | existe |
| `public.inspiration_posts (id, user_id, image_path, caption, created_at)` | existe; la migración añade `category` |
| `public.feedback (id, user_id, category, message, email, status, created_at)` | existe |
| Bucket `avatars` | público, 2 MB, jpeg/png/webp |
| Bucket `inspiration` | 10 MB, jpeg/png/webp/gif |
| Auth | email y contraseña, confirmación por correo, OTP de 6 dígitos (3600 s), sin anónimos ni proveedores sociales |

La migración **no cambia** ningún ajuste de Auth, no borra datos, no elimina tablas y no desactiva RLS.

## 1. Dónde encontrar la URL y la clave publicable

En el panel de Supabase, abre el proyecto **SimmerSpace** y ve a **Project Settings → API Keys** (o **Connect**):

- **Project URL**: `https://<ref>.supabase.co`
- **Publishable key**: empieza por `sb_publishable_`. Es pública por diseño; los datos se protegen con RLS.

**Nunca** pongas en la app la *secret key* (`sb_secret_…`) ni la clave `service_role`. SimmerSpace las rechaza
aunque se configuren por error.

## 2. Revisar el esquema antes de aplicar la migración

Ejecuta esta consulta (solo lectura) en **SQL Editor** y revisa el resultado:

```sql
select 'usernames repetidos' as revision, lower(username) as valor, count(*)::text as detalle
  from public.profiles group by lower(username) having count(*) > 1
union all
select 'trigger en auth.users', tgname, pg_get_triggerdef(oid)
  from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal
union all
select 'politica', tablename || ' · ' || policyname, cmd || ' · ' || coalesce(qual, '') || ' · ' || coalesce(with_check, '')
  from pg_policies where schemaname in ('public', 'storage')
union all
select 'tipo de id', table_name, data_type
  from information_schema.columns where table_schema = 'public' and column_name = 'id'
   and table_name in ('profiles', 'inspiration_posts', 'feedback');
```

- Si aparecen **usernames repetidos** (sin distinguir mayúsculas), corrígelos antes: el índice único fallaría.
- Si ya hay un **trigger** propio que crea perfiles con otro nombre, la migración añade `on_auth_user_created`;
  las dos funciones no chocan (la de SimmerSpace no hace nada si el perfil ya existe), pero puedes quitar la antigua.
- Las políticas que ya existan con otros nombres siguen activas. Revisa que ninguna sea más permisiva de lo que quieres
  (por ejemplo, `using (true)` en `update` o `delete`).

## 3. Aplicar la migración

Archivo: `supabase/migrations/20261030000000_simmerspace_community.sql`. Se puede ejecutar más de una vez.

- **SQL Editor**: pega el archivo completo y pulsa **Run**.
- **CLI**: `supabase link --project-ref <ref>` y después `supabase db push`.

Qué hace:

- **Perfiles**: RLS activo; lectura para usuarios con sesión; cada persona crea y edita solo su perfil.
  Índice único `lower(username)`. Disparador `handle_new_user` (idempotente, `security definer`, `search_path` vacío)
  que lee `raw_user_meta_data->>'username'`; si el nombre está ocupado añade un sufijo corto.
  Función `ensure_my_profile()` que recrea el perfil si falta, y relleno de perfiles para usuarios antiguos.
- **`username_available(name)`**: la única función que puede llamar alguien sin sesión (la pantalla de registro).
  Solo devuelve verdadero o falso.
- **Inspiración**: columna `category` (`cas`, `build`, `gameplay`, `story`, `other`), descripción de hasta 500
  caracteres, y la imagen debe estar en la carpeta de su autor. Lectura para usuarios con sesión; crear, editar
  y borrar solo lo propio.
- **Feedback**: categorías `suggestion`, `bug_report`, `feature_request`, `donation_feedback`, `other`; cada persona
  envía (siempre con estado `pending`) y lee solo lo suyo.
- **Storage**: en `avatars` e `inspiration` solo se puede subir o borrar dentro de la carpeta cuyo primer nombre es
  `auth.uid()`. Los avatares son públicos; las imágenes de Inspiración solo se ven con sesión (la app usa enlaces
  firmados de 1 hora, así que funciona tanto si el bucket es público como si es privado).

Las restricciones nuevas se crean `NOT VALID`: las filas antiguas que no cumplan no se tocan.

Prueba local (opcional, sin tocar el proyecto real) con PostgreSQL 16:

```bash
psql -d prueba -f supabase/tests/local-auth-stub.sql
psql -d prueba -f supabase/tests/existing-schema-stub.sql
psql -d prueba -f supabase/migrations/20261030000000_simmerspace_community.sql
psql -d prueba -f supabase/migrations/20261030000000_simmerspace_community.sql   # segunda vez: idempotente
psql -d prueba -f supabase/tests/community-check.sql                          # "community checks passed"
```

## 4. Plantillas de correo

SimmerSpace usa **códigos de 6 dígitos**, no enlaces. En **Authentication → Email Templates**, las plantillas
**Confirm signup** y **Reset password** deben incluir `{{ .Token }}`, por ejemplo:
`Tu código de SimmerSpace es {{ .Token }}`. El correo incluido en el plan gratuito envía pocos mensajes por hora;
para usuarios reales configura un SMTP propio.

## 5. Conectar la app

Orden de prioridad: variables de entorno → `.env.local` (solo al ejecutar desde el código fuente) →
`simmerspace.config.json` en la carpeta de datos → `electron/public-config.json` empaquetado.

- **Desarrollo**: en `.env.local` (ignorado por git), junto a `package.json`:
  ```
  SUPABASE_URL=https://<ref>.supabase.co
  SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
  ```
  La copia empaquetada **nunca** lee `.env.local`.
- **Compilación para repartir**: copia `electron/public-config.example.json` a `electron/public-config.json` con la
  URL y la clave publicable (solo valores públicos; también está en `.gitignore`).

## 6. Qué se guarda dónde

| Dato | Dónde |
| --- | --- |
| Sesión | En el equipo, cifrada con `safeStorage` (DPAPI en Windows); si no hay cifrado, solo en memoria |
| Perfil (usuario, avatar) | `profiles` y `avatars/<id de usuario>/avatar-….webp` (512 px como máximo) |
| Publicaciones | `inspiration_posts` e `inspiration/<id de usuario>/<id>.webp|gif` (1920 px como máximo) |
| Comentarios | `feedback` |
| Carpetas, etiquetas, colecciones, creadores seguidos | Solo en el equipo |

Borrar una publicación borra también su imagen. Cambiar el avatar borra el anterior.

## 7. Límites del plan gratuito

El plan Free pausa los proyectos inactivos tras unos días y tiene límites de base de datos, almacenamiento,
usuarios activos y correos. Consulta los valores actuales en <https://supabase.com/pricing>. SimmerSpace no cambia
ningún límite.
