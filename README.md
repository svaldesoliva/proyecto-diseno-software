# Proyecto Diseño de Software
Temática 4B: Comparador de precios computadores

Frontend y backend usan TypeScript. El contrato de CPU, GPU y RAM se comparte en
`shared/products.ts`. El backend combina las fichas de `backend/data.json` con
las publicaciones de CPU, GPU y RAM de PC Factory al arrancar y cada 30 minutos.

El inicio muestra nombre, imagen y el menor precio en CLP de las ofertas con stock.
Cada tarjeta abre una vista con las especificaciones y las fuentes del producto
mediante `/?product=<id>`. Se puede recargar o compartir ese enlace.

Las ofertas se guardan en `offers` con `store`, `priceClp`, `url` e `inStock`.
Las ofertas de PC Factory se pueden consultar y guardar con los comandos de
[`backend/scrapers`](backend/scrapers/README.md). Se muestra “Precio no disponible”
si no hay ofertas con stock. No se consideran precios vacíos, cero o negativos.

Funcionalidades:
- CPU: Imagen, Marca, Serie (i9, Ryzen 9, etc), Número de procesador (ej: 14900K, 9950x, etc ), Precio en Página, Página vendedora, Cantidad Núcleos, Cantidad Hilos, Frecuencia Máxima, Caché, Potencia base (W), Potencia máxima (W), Socket, Arquitectura, Familia, Tamaño de memoria máximo (GB), Tipos de memoria aceptados (DDR5, DDR4, etc), Fecha de lanzamiento, CPU Mark Score.
- RAM: Imagen, Marca, Capacidad (GB), Frecuencia (MHz), Estándar (DDR5, DDR4, etc.), Formato (UDIMM / SODIMM)
- GPU: Imagen, Marca (Asus, ), Chip (RTX 5060), Precio, Tamaño Memoria, Tipo memoria, Interfaz (ej:PCIe 5.0 x8 )


## Ejecutar

Requiere Deno 2 y Node.js 24.

Terminal 1 para backend:

```bash
cd backend/
deno task dev
```

Terminal 2 para front:
```bash
cd frontend/
npm install
npm run dev
```

Abrir `http://localhost:5173`. El proxy
de Vite envía las consultas `/api` al backend en `http://localhost:8000`.

## Inicio de sesión

Abre `http://localhost:5173` y elige **Crear cuenta** para probar el acceso local.
Ingresa un nombre de usuario y una contraseña de al menos 12 caracteres. Las
cuentas se guardan en `backend/.auth/accounts.sqlite` con scrypt y un salt
aleatorio. Deno abre una sesión de 8 horas y entrega una cookie `HttpOnly`.
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

Para servir la app fuera de localhost, configura `APP_ORIGIN` con el origen HTTPS
del frontend, registra el callback en ese mismo origen y reenvía `/api` a Deno.

## Verificar

- Desde `backend`, ejecuta `deno task check`, `deno lint` y `deno task test`.
- Desde `frontend`, ejecuta `npm run lint` y `npm run build`.
- `npm run build` comprueba los tipos antes de generar la página.

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
