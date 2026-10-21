# Proyecto Diseño de Software
Temática 4B: Comparador de precios computadores

Frontend y backend usan TypeScript. El contrato de CPU, GPU y RAM se comparte en
`shared/products.ts`, los datos del catálogo están en `backend/data.json`.

El inicio muestra nombre, imagen y el menor precio en CLP de las ofertas con stock.
Cada tarjeta abre una vista con las especificaciones y las fuentes del producto
mediante `/?product=<id>`. Se puede recargar o compartir ese enlace.

Las ofertas se guardan en `offers` con `store`, `priceClp`, `url` e `inStock`.
El catálogo todavía no tiene ofertas reales: muestra “Precio no disponible” hasta
que se integren las tiendas. No se consideran precios vacíos, cero o negativos.

Funcionalidades:
- CPU: Imagen, Marca, Serie (i9, Ryzen 9, etc), Número de procesador (ej: 14900K, 9950x, etc ), Precio en Página, Página vendedora, Cantidad Núcleos, Cantidad Hilos, Frecuencia Máxima, Caché, Potencia base (W), Potencia máxima (W), Socket, Arquitectura, Familia, Tamaño de memoria máximo (GB), Tipos de memoria aceptados (DDR5, DDR4, etc), Fecha de lanzamiento, CPU Mark Score.
- RAM: Imagen, Marca, Capacidad (GB), Frecuencia (MHz), Estándar (DDR5, DDR4, etc.), Formato (UDIMM / SODIMM)
- GPU: Imagen, Marca (Asus, ), Chip (RTX 5060), Precio, Tamaño Memoria, Tipo memoria, Interfaz (ej:PCIe 5.0 x8 )


## Ejecutar

Requiere Deno 2 y Node.js 24. Las pruebas del frontend ejecutan TypeScript con el
soporte nativo de Node, sin un runner adicional.

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

Abrir la dirección que muestra Vite (normalmente `http://localhost:5173`). El proxy
de Vite envía las consultas `/api` al backend en `http://localhost:8000`.

## Verificar

- Backend: `deno test`, `deno task check` y `deno lint` desde `backend`.
- Frontend: `npm test`, `npm run typecheck`, `npm run lint` y `npm run build` desde `frontend`.
- `npm run build` comprueba los tipos antes de generar la página.

## API

- `GET /api/products`: catálogo completo.
- `GET /api/products/category/cpu`: procesadores.
- `GET /api/products/category/gpu`: tarjetas gráficas.
- `GET /api/products/category/ram`: memorias RAM.

Las rutas o categorías inexistentes devuelven `404`. Las rutas de productos solo aceptan `GET`.

### Filtros combinables

Se pueden agregar parámetros tanto a `/api/products` como a las rutas por categoría:

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
