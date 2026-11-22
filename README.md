# Proyecto Diseño de Software
Temática 4B: Comparador de precios computadores

Frontend y backend usan TypeScript. El contrato de CPU, GPU y RAM se comparte en
`shared/products.ts`. Supabase (PostgreSQL) guarda el catálogo, las ofertas, el
historial de precios, las cuentas y las sesiones. El backend combina las fichas de
`backend/data.json` con las publicaciones de CPU, GPU y RAM de PC Factory.

El inicio muestra nombre, imagen y el menor precio en CLP de las ofertas con stock.
Cada tarjeta abre una vista con las especificaciones y las fuentes del producto
mediante `/?product=<id>`. Se puede recargar o compartir ese enlace.
La ficha incluye una tabla paginada con el historial de precios de sus ofertas.

Las ofertas se guardan en `offers` con `store`, `priceClp`, `url` e `inStock`.
Las ofertas de PC Factory se pueden consultar y guardar con los comandos de
[`backend/scrapers`](backend/scrapers/README.md). Se muestra “Precio no disponible”
si no hay ofertas con stock. No se consideran precios vacíos, cero o negativos.

Funcionalidades:
- CPU: Imagen, Marca, Serie (i9, Ryzen 9, etc), Número de procesador (ej: 14900K, 9950x, etc ), Precio en Página, Página vendedora, Cantidad Núcleos, Cantidad Hilos, Frecuencia Máxima, Caché, Potencia base (W), Potencia máxima (W), Socket, Arquitectura, Familia, Tamaño de memoria máximo (GB), Tipos de memoria aceptados (DDR5, DDR4, etc), Fecha de lanzamiento, CPU Mark Score.
- RAM: Imagen, Marca, Capacidad (GB), Frecuencia (MHz), Estándar (DDR5, DDR4, etc.), Formato (UDIMM / SODIMM)
- GPU: Imagen, Marca (Asus, ), Chip (RTX 5060), Precio, Tamaño Memoria, Tipo memoria, Interfaz (ej:PCIe 5.0 x8 )


## Ejecutar

Requiere Deno 2, Node.js 24 y un proyecto Supabase.

Desde `proyecto/`, instala las dependencias:

```bash
npm ci
npm --prefix frontend ci
```

Completa `backend/.env` usando las variables de `backend/.env.example`. Si ya
configuraste Google, conserva sus credenciales. Copia `DATABASE_URL` desde
**Connect → Session pooler** de Supabase, con su contraseña correctamente
codificada para una URL. La conexión usa TLS con verificación del certificado
y desactiva los prepared statements para este pooler.
El backend incluye el certificado público CA de Supabase (`backend/supabase-ca.crt`)
para verificar su certificado TLS; mantiene también las autoridades de confianza
de Node. No se desactiva la verificación TLS.
Se limita el pool local a una conexión. Para evitar los problemas de pipelining
de Postgres.js en el pooler transaccional, las URL del pooler compartido de
Supabase se conectan en modo sesión (puerto 5432). El parámetro `workaround`
de las URL de Vercel se descarta porque corresponde a su driver HTTP.
En Vercel se acepta también `POSTGRES_URL`, que instala automáticamente la
integración con Supabase; no hace falta duplicar ese secreto como `DATABASE_URL`.

El proyecto publicado ya tiene el esquema y su migración inicial registrados.
Para aplicar migraciones manualmente a otro proyecto, autentica y vincula la CLI
con el proyecto de destino antes de ejecutarlas:

```bash
npx --yes supabase@3.2.0 login
npx --yes supabase@3.2.0 link --project-ref <project-ref>
npm run migrate
```

La CLI aplica solo los archivos pendientes de `supabase/migrations` y registra
su versión en `supabase_migrations.schema_migrations`. No vuelvas a ejecutar la
migración inicial desde el SQL Editor. El esquema privado `app_private` contiene
las tablas de la aplicación.
No expongas ese esquema mediante la Data API. Las credenciales de la base se
usan exclusivamente en el backend, nunca en variables `VITE_*`.

Para conservar las cuentas locales anteriores, ejecuta después de la migración:

```bash
npm run import:accounts
```

Lee `backend/.auth/accounts.sqlite` sin modificarlo y copia los hashes y salts
existentes. No sobrescribe usuarios que ya existan en Supabase. Las sesiones
anteriores no se importan: vuelve a iniciar sesión. Sin este paso, las cuentas
locales anteriores solo siguen disponibles en el archivo SQLite.

Terminal 1 para backend:

```bash
cd backend/
deno task dev
```

Terminal 2 para front:
```bash
cd frontend/
npm run dev
```

Abrir `http://localhost:5173`. El proxy
de Vite envía las consultas `/api` al backend en `http://localhost:8000`.
El servidor local actualiza los precios al arrancar y cada 30 minutos. Si falla
una fuente o la base, conserva el último catálogo guardado y reintenta en el
siguiente ciclo. El historial comienza con la primera consulta exitosa; no se
inventan precios anteriores.

Para consultar precios manualmente o completar las fichas técnicas:

```bash
npm run refresh
npm run enrich
```

Estos comandos se ejecutan desde `proyecto/`. `enrich` consulta CPU-Monkey e
Icecat y persiste las fichas. Puede demorar varios minutos; ejecútalo localmente
contra Supabase. El refresco de precios reutiliza esas fichas, sin volver a
consultar las bases técnicas en cada ejecución de Vercel.

## Seguimiento de precios

Cada oferta tiene una identidad independiente del precio. Para PC Factory se
usa el ID numérico de su publicación; cambiar el slug de la URL no crea una
oferta nueva. Se guarda una primera observación y luego una fila por cada cambio
de precio: `100 → 80 → 100` produce tres registros. Consultar repetidamente
`100` produce uno. Los cambios de stock se guardan en la oferta actual y no
agregan precios al historial.

Un trigger registra el cambio en la misma transacción que actualiza las ofertas
y el catálogo. Una consulta incompleta o fallida no escribe un catálogo parcial.
Las publicaciones que desaparecen quedan inactivas sin borrar su historial.
Las actualizaciones concurrentes se serializan al guardar, y una consulta que
comenzó antes no puede reemplazar una más reciente ya guardada.

Las fechas corresponden al inicio de la consulta del catálogo, en UTC; la ficha
las muestra en la zona horaria del navegador. El historial refleja los cambios
detectados entre consultas, no todos los cambios que puedan ocurrir entre ellas.
El seguimiento actual cubre las ofertas de PC Factory que consulta el scraper.

## Desplegar en Vercel

1. Crea el esquema de Supabase con la migración anterior. Ejecuta `npm run refresh`
   para poblarlo y, si necesitas las fichas automáticas, `npm run enrich`.
2. Importa el repositorio en Vercel y usa **`proyecto/` como Root Directory**
   (o `.` si el repositorio comienza en esta carpeta), con Node.js 24 y
   **Framework Preset: Other** (la compilación de Vite está configurada explícitamente).
   No selecciones `frontend/`: las funciones y `vercel.json` están en la raíz.
3. El `vercel.json` configura Vite, instala ambos grupos de dependencias,
   ejecuta `npm test && npm run build` y publica `frontend/dist`. Las rutas `/api/*` las
   atiende la función `api/index.ts` mediante un rewrite, usando el mismo dominio y cookies.
4. Agrega estas variables de entorno para **Production** y despliega:

   | Variable | Valor |
   | --- | --- |
   | `POSTGRES_URL` o `DATABASE_URL` | Conexión PostgreSQL de Supabase (la integración ya instala `POSTGRES_URL`) |
   | `APP_ORIGIN` | Origen HTTPS estable, por ejemplo `https://tu-app.vercel.app` |
   | `CRON_SECRET` | Secreto aleatorio, por ejemplo generado con `openssl rand -hex 32` |
   | `GOOGLE_CLIENT_ID` | Cliente Google, si habilitas ese login |
   | `GOOGLE_CLIENT_SECRET` | Secreto Google, si habilitas ese login |

5. Registra `https://tu-app.vercel.app/api/auth/google/callback` en Google.
   Si cambias el dominio, actualiza también `APP_ORIGIN` y vuelve a desplegar.
6. Comprueba registro, login, catálogo y ficha del producto. En Vercel, ejecuta
   el cron desde el panel y verifica que responda `200`. Consulta el historial
   después de detectar un cambio real de precio.

El cron incluido consulta `/api/cron/prices` una vez al día, a las 12:00 UTC
(en Hobby puede ejecutarse dentro de esa hora). La ruta exige
`Authorization: Bearer <CRON_SECRET>`, que Vercel envía automáticamente.
Los cron se ejecutan en producción; usa otra base y otro `APP_ORIGIN` si
configuras entornos Preview para no compartir cuentas ni datos con producción.

Vercel Hobby admite cron con frecuencia diaria. Para consultar cada 30 minutos,
usa un programador externo que invoque la misma ruta con ese encabezado, o un
plan que admita `*/30 * * * *`. Cada ejecución debe terminar dentro de los 300
segundos configurados. Los fallos conservan los datos anteriores; revisa los
logs del cron si la fecha de consulta deja de avanzar. Un catálogo vacío antes
del primer refresco se muestra vacío, sin publicar los precios de ejemplo.

Referencias: [PostgreSQL en Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres),
[Vercel Functions](https://vercel.com/docs/functions),
[límites de cron](https://vercel.com/docs/cron-jobs/usage-and-pricing) y
[protección del cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## Despliegue desde GitHub

El repositorio de producción es `svaldesoliva/proyecto-diseno-software`, rama `main`.
Después de un push o merge a esa rama:

- Vercel instala las dependencias, ejecuta las pruebas y compila con `vercel.json`.
  Si el proceso pasa, publica el frontend y la API en el dominio de producción.
- Supabase sincroniza el mismo repositorio desde `.` y aplica las migraciones
  pendientes de `supabase/migrations`. La integración tiene **Deploy to production**
  activado para `main`. **Automatic branching** queda desactivado; no crea bases
  de datos de pago para las ramas de trabajo.

`supabase/config.toml` habilita las migraciones y desactiva el seed. La migración
`202611210001` ya se registró como aplicada porque el esquema se creó antes de
conectar GitHub. Los productos, precios históricos, cuentas y sesiones se
conservan en Supabase; no se exportan al repositorio ni se reemplazan al desplegar.

Para cambiar el esquema, crea una nueva migración, revisa su SQL y ejecuta las
pruebas antes de subirla:

```bash
npx --yes supabase@3.2.0 migration new descripcion_del_cambio
npm test
npm run build
git add .
git commit -m "Describe el cambio"
git push origin main
```

No edites migraciones ya aplicadas. Mantén los cambios de esquema compatibles
con la versión anterior de la API: Supabase y Vercel despliegan por separado.
Las pruebas reproducen toda la cadena de migraciones en PostgreSQL en memoria.
Los secretos permanecen en Vercel/Supabase; `.env`, SQLite, `.temp` y `.vercel`
están excluidos del control de versiones.

## Inicio de sesión

Abre `http://localhost:5173` y elige **Crear cuenta** para probar el acceso local.
Ingresa un nombre de usuario y una contraseña de al menos 12 caracteres. Las
cuentas se guardan en Supabase con scrypt y un salt aleatorio. El backend abre
una sesión de 8 horas y entrega una cookie `HttpOnly`. Las sesiones y los intentos
de Google también se guardan en PostgreSQL para compartirlos entre funciones.
**Cerrar sesión** revoca la sesión en el servidor. Los enlaces a un producto
conservan el destino durante el inicio de sesión.

Para activar **Continuar con Google**:

1. En [Google Auth Platform](https://console.cloud.google.com/auth/clients),
   crea un cliente OAuth de tipo **Aplicación web**. Si la aplicación está en
   modo de prueba, agrega tu cuenta como usuario de prueba en **Público**.
2. Registra `http://localhost:5173/api/auth/google/callback` como URI de
   redireccionamiento autorizado.
3. En `backend/.env`, completa `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
   Reinicia Deno y abre la app en `http://localhost:5173`.

Google usa [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
con el flujo de código y PKCE. El backend valida el token de identidad con
[`openid-client`](https://github.com/panva/openid-client), de Filip Skokan, y
usa el identificador `sub` de Google. Las cuentas locales y de Google son
independientes. Si las credenciales de Google quedan vacías, la app ofrece solo
el acceso local.

Se conserva la autenticación convencional y Google OpenID Connect del proyecto;
Supabase se usa como PostgreSQL, sin reemplazar esos flujos por Supabase Auth.

## Verificar

- Desde `proyecto/`, ejecuta `npm test` y `npm run build`.
- Desde `backend`, ejecuta `deno task check` y `deno lint`.
- Desde `frontend`, ejecuta `npm run lint` y `npm run build`.
- `npm run build` comprueba los tipos antes de generar la página.
- Las pruebas usan PostgreSQL en memoria (PGlite), sin credenciales Supabase.
  Cubren trigger, reversión de transacciones, actualizaciones antiguas, ofertas
  desaparecidas, paginación, permisos de la API, importación de cuentas y sesiones.

## API

- `POST /api/auth/register` y `POST /api/auth/login`: reciben `{ username, password }` y abren una sesión.
- `GET /api/auth/session`: consulta la sesión y la disponibilidad de Google.
- `POST /api/auth/logout`: cierra la sesión.
- `GET /api/auth/google` y `GET /api/auth/google/callback`: inicio y retorno de Google.

El catálogo requiere una sesión válida. Sin ella, las consultas de productos
devuelven `401`.

- `GET /api/products`: catálogo completo.
- `GET /api/products/category/cpu`: procesadores.
- `GET /api/products/category/gpu`: tarjetas gráficas.
- `GET /api/products/category/ram`: memorias RAM.
- `GET /api/products/<id>/prices`: primera página del historial (100 entradas).
  Devuelve `{ entries, nextCursor }`, con precios en CLP y fechas UTC.
  Para continuar usa `?before=<nextCursor>`. Incluye ofertas inactivas del producto.
- `GET /api/cron/prices`: actualiza el catálogo y los precios; requiere el secreto
  del cron, no una sesión de usuario.

Las rutas o categorías inexistentes devuelven `404`. Las rutas de productos solo aceptan `GET`.

### Filtros combinables

Se pueden agregar parámetros tanto a `/api/products` como a las rutas por categoría:

Sería `GET /api/products?` y agregar:
- `id=intel-core-i9-14900k`: ID exacto.
- `name=ryzen`: parte del nombre, sin distinguir mayúsculas.
- `category=gpu`: categoría (`cpu`, `gpu` o `ram`).
- `<campo>_gt=<número>`: especificación numérica estrictamente mayor al valor indicado.

Ejemplos:

```text
/api/products?id=intel-core-i9-14900k
/api/products?name=ryzen
/api/products?category=ram&capacityGb_gt=8
/api/products?category=cpu&cores_gt=16
/api/products/category/gpu?name=geforce&memoryGb_gt=4
```

Los filtros sin coincidencias devuelven `200` con `[]`. Los parámetros desconocidos,
valores vacíos, categorías inválidas o números no finitos devuelven `400`.
