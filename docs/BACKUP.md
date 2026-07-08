# Backups de la base de datos

La base es un **Postgres administrado en Neon**. Neon ya te da cifrado y
_point-in-time recovery_ (restaurar a un momento exacto) dentro de una ventana
que depende del plan. Este backup semanal es una **copia externa e independiente**
en Google Drive, por si algún día se pierde el acceso a Neon, se borra el proyecto,
o hace falta recuperar algo más viejo que la ventana de PITR.

- **Qué guarda:** un dump completo de toda la base (movimientos, inventario,
  costos, categorías, proveedores, usuarios, presupuestos), comprimido en `.sql.gz`.
- **Cuándo:** todos los domingos a las 00:00 (hora Argentina), vía GitHub Actions.
  También se puede disparar a mano.
- **Retención:** se conservan ~8 semanas; los más viejos se borran solos.
- **Workflow:** [`.github/workflows/db-backup.yml`](../.github/workflows/db-backup.yml)

---

## Setup (una sola vez)

Todo esto lo tenés que hacer vos porque requiere tus credenciales de Neon y de
Google. Son 3 pasos.

### 1. Crear el remote de Google Drive con rclone (en tu compu)

`rclone` es la herramienta que sube a Drive. Genera un token OAuth de **tu propia
cuenta de Google**, así los archivos quedan en tu Drive (no en una cuenta de servicio).

```bash
# Instalar rclone (Mac)
brew install rclone

# Configurar el remote de Drive
rclone config
```

En el asistente de `rclone config`:

1. `n` (New remote)
2. Nombre: **`gdrive`** (usá exactamente ese nombre)
3. Storage: buscá **`drive`** (Google Drive) y elegí su número
4. `client_id` y `client_secret`: dejalos **en blanco** (Enter)
5. Scope: elegí **`1`** (`drive` — acceso full) o **`3`** (`drive.file` — solo
   archivos creados por rclone, más restringido y suficiente para esto)
6. `root_folder_id`, `service_account_file`: **en blanco** (Enter)
7. Edit advanced config: **`n`**
8. Use auto config: **`y`** → se abre el navegador, iniciá sesión y autorizá
9. Configure as team drive: **`n`**
10. Confirmá con `y` y salí con `q`

Probá que anda:

```bash
rclone mkdir gdrive:Backups/avantec-db
rclone lsd gdrive:Backups
```

Ahora obtené el contenido del config para cargarlo como secret:

```bash
cat "$(rclone config file | tail -1)"
```

Copiá **todo** lo que imprime (desde `[gdrive]` hacia abajo).

### 2. Cargar los secrets y la variable en GitHub

En el repo → **Settings → Secrets and variables → Actions**.

**Secrets** (pestaña "Secrets", botón "New repository secret"):

| Nombre | Valor |
|---|---|
| `RCLONE_CONF` | Todo el contenido que copiaste en el paso 1 (`[gdrive]` ...) |
| `DATABASE_URL_UNPOOLED` | La URL de conexión **directa** de Neon (ver abajo) |

Para `DATABASE_URL_UNPOOLED`: en el dashboard de Neon → tu proyecto → **Connection
string**, elegí la opción **"Direct connection"** (NO la pooled). Tiene que
terminar en `?sslmode=require`. Es la misma que en tu `.env` figura como
`DATABASE_URL_UNPOOLED`.

**Variable** (pestaña "Variables", botón "New repository variable"):

| Nombre | Valor |
|---|---|
| `RCLONE_DRIVE_DEST` | `gdrive:Backups/avantec-db` |

### 3. Probar

En el repo → pestaña **Actions** → workflow **"Backup DB a Google Drive"** →
botón **"Run workflow"**. En 1-2 minutos deberías ver un archivo
`avantec-db_FECHA.sql.gz` en `Backups/avantec-db` en tu Drive.

---

## Cómo restaurar un backup

```bash
# Bajar el backup de Drive
rclone copy gdrive:Backups/avantec-db/avantec-db_2026-07-08_030000.sql.gz .

# Restaurar en una base nueva/vacía (¡NO sobre la de producción sin estar seguro!)
gunzip -c avantec-db_2026-07-08_030000.sql.gz | psql "URL_DE_LA_BASE_DESTINO"
```

> Para restaurar sobre una base existente conviene primero vaciarla o crear una
> base nueva, revisar, y recién ahí apuntar la app. El dump se genera con
> `--no-owner --no-privileges` para que importe limpio en cualquier Postgres.
