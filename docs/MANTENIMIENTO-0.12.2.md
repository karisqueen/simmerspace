# simmerspace 0.12.2: cambios y configuración

Este documento explica qué cambia en la 0.12.2 y qué hay que hacer en Supabase para activarlo. El análisis de descargas está en [DESCARGAS-CURSEFORGE-0.12.2.md](DESCARGAS-CURSEFORGE-0.12.2.md).

## Qué funciona sin tocar Supabase

Todo lo local funciona al instalar la versión: descargas directas, instalación asistida, filtros de Explorar, creadores seguidos, biblioteca, herramientas de Cuidado de la biblioteca, vistas previas y ajustes de Los Sims 4.

Hasta aplicar lo siguiente, Creadores muestra una muestra en vivo con un aviso, y la opción Eliminar cuenta no aparece.

## Pasos en Supabase

Proyecto: **simmerspace** (ref `wvvookczuzlxihwdlnbl`).

### 1. Rotar la clave secreta

Pendiente desde el 2026-10-30, porque se expuso en un chat. Hazlo en **Project Settings > API Keys** antes de seguir. Los workers usan la variable `SUPABASE_SERVICE_ROLE_KEY`, que Supabase les da automáticamente.

### 2. Ejecutar la migración

1. Abre el proyecto y entra en **SQL Editor > New query**.
2. Pega todo el contenido de `supabase/migrations/20261101000000_maintenance_0122.sql`.
3. Pulsa **Run**.

Resultado esperado: `Success`. Se puede ejecutar dos veces sin problema.

Comprobación:

```sql
select jobname, schedule from cron.job where jobname like 'simmerspace%';
select count(*) from vault.decrypted_secrets where name = 'simmerspace_worker_secret';
select status from public.cf_index_state;
```

Debes ver 2 tareas con `* * * * *`, un `1` y `idle` o `running`.

La migración hace esto, sin borrar datos:

- Activa `pg_cron` y `pg_net`, y crea un secreto aleatorio en Vault.
- Crea `account_deletions`, `cf_creators`, `cf_index_projects` y `cf_index_state`, con RLS.
- Cambia la clave foránea de `inspiration_comments.user_id` a `on delete set null`, para que borrar una cuenta no arrastre las respuestas de otros simlings.
- Programa dos tareas: una cada minuto para el borrado de cuentas y otra para el índice de creadores.

### 3. Desplegar las funciones

Desde la carpeta del proyecto, con la CLI de Supabase:

```powershell
supabase functions deploy account-deletion-worker --no-verify-jwt --project-ref wvvookczuzlxihwdlnbl
supabase functions deploy curseforge-index --no-verify-jwt --project-ref wvvookczuzlxihwdlnbl
supabase functions deploy curseforge-proxy --no-verify-jwt --project-ref wvvookczuzlxihwdlnbl
```

Las tres comprueban por sí mismas quién las llama. El secreto `CURSEFORGE_API_KEY` ya existe. `curseforge-proxy` se vuelve a desplegar por la ruta `/cdn-resolve`, necesaria cuando el CDN exija la clave.

### 4. Comprobar el índice de creadores

La primera lectura del catálogo tarda unas horas y se repite cada 7 días. Para seguirla:

```sql
select status, position, jsonb_array_length(queue) as total, pages_read, last_error, finished_at from public.cf_index_state;
select count(*) from public.cf_creators;
```

Al terminar, `status` vuelve a `idle` y Creadores muestra el catálogo completo.

**Antes de activarlo, revisa las condiciones de uso de la API de CurseForge:** este índice guarda metadatos públicos en tu base de datos. Si no quieres mantenerlo, ejecuta `select cron.unschedule('simmerspace-creator-index');`.

### 5. Probar la eliminación de cuenta

Hazlo con una cuenta de prueba, nunca con la tuya:

1. En la app, entra en la cuenta de prueba y elige **Eliminar cuenta**.
2. En SQL Editor, comprueba la fecha: `select status, scheduled_for from public.account_deletions;`
3. Cierra simmerspace.
4. Para no esperar 60 minutos, adelanta esa solicitud: `update public.account_deletions set scheduled_for = now() where status = 'pending';`
5. Espera dos minutos y comprueba que `status` sea `completed`, que el usuario ya no exista en **Authentication** y que no queden archivos suyos en los buckets `avatars` e `inspiration`.

Si queda en `failed`, el motivo está en `last_error`; se reintenta hasta 5 veces.

## Eliminación de cuenta

Tras confirmar, la cuenta se elimina a los 60 minutos, con un margen de hasta un minuto por la tarea programada. Se puede cancelar mientras esté pendiente.

Se elimina: la cuenta de acceso, el perfil, el avatar, las publicaciones y sus imágenes, los tableros, los seguimientos y los comentarios. El feedback se conserva sin autor ni correo. Un comentario con respuestas de otros queda como "comentario eliminado", sin autor.

La tabla `account_deletions` conserva el identificador de la cuenta borrada como registro de que se hizo.

## Metadatos de la biblioteca

Las etiquetas se perdían porque guardar reemplazaba el catálogo completo, y un catálogo que no se había podido leer se trataba como vacío. Además, la identidad de un archivo era solo su ruta. Ahora:

- Nunca se guarda sobre un catálogo sin leer.
- Un archivo dañado se aparta, y entra la copia de respaldo.
- `library-metadata.json` asigna a cada archivo un identificador, su SHA-256 y su nombre original.
- Un archivo renombrado o movido, incluso fuera de la app, se reconecta por su contenido exacto.
- Los metadatos nunca se escriben dentro de un `.package` o `.ts4script`.

Las etiquetas que ya se perdieron en versiones anteriores no se pueden recuperar.

## Vistas previas

Se guardan en `library-previews`, dentro de la carpeta de datos de la app. No se suben a ningún sitio.

## Borrado permanente

Las herramientas de Cuidado de la biblioteca no usan papelera ni cuarentena. Solo se puede borrar lo que encontró la última búsqueda y lo que seleccionaste, y las carpetas solo se eliminan si siguen vacías. Eliminar un mod desde su fila sigue usando la Papelera de Windows, como antes.

## Ajustes de Los Sims 4

Se modifica solo `showmodliststartup`, `modsdisabled` (invertido) y `scriptmodsenabled` en `Options.ini`. La primera escritura guarda `Options.ini.simmerspace-original`. No se escribe nada con el juego abierto, porque el juego reescribe ese archivo al cerrarse.

## Compatibilidad con el actualizador

No hay un launcher aparte: el sistema es electron-updater con el instalador NSIS, y no cambia. Siguen iguales `appId`, `productName`, el canal de GitHub y los nombres de los archivos. Los datos del usuario están fuera de la carpeta de instalación, así que una actualización no los toca.

## Limitaciones conocidas

- **Proyectos con la distribución desactivada:** la API niega el enlace a la clave de simmerspace, así que usan la instalación asistida. Con otra autorización de CurseForge pasarían a ser directos sin tocar el código.
- **Contenido de Tray:** Sims, hogares y solares no se instalan; se explica y se remite al sitio web.
- **Filtros:** dependen de las categorías que asigna cada creador. Maxis Match, Alpha y Script buscan en el título y el resumen. El filtro "Custom Content" no existe porque CurseForge no permite excluir una clase.
- **Creadores en vivo:** sin el índice no se puede buscar en todo el catálogo, porque CurseForge no busca por autor.
- **Popularidad de un creador:** es la suma de descargas de sus proyectos. CurseForge no ofrece un ranking propio.
- **ZIP muy grandes:** la instalación los carga en memoria al descomprimirlos, con un máximo de 1 GB.
- **Seguir creadores:** se guarda en este PC, como hasta ahora, y no se sincroniza con la cuenta.
