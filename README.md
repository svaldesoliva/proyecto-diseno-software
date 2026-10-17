# Proyecto Diseño de Software
Temática 4B: Comparador de precios computadores

Frontend y backend usan TypeScript. El contrato de CPU, GPU y RAM se comparte en
`shared/products.ts`; los datos del catálogo siguen en `backend/data.json`.

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
