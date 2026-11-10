## Catálogo automático

Al ejecutar `deno task dev` desde `backend`, el servidor consulta todas las
páginas de CPU (`272`), GPU (`334`) y RAM (`264`) publicadas por PC Factory.
Un segundo listado con las sucursales `11,3000` indica qué ofertas tienen stock
online. Las publicaciones agotadas también aparecen en el catálogo.

El servidor actualiza el catálogo en memoria cada 30 minutos. Si una consulta
falla, conserva el último resultado completo. Si falla al arrancar, usa
`data.json` mientras espera el siguiente intento.

Las fichas manuales se enlazan por el ID de PC Factory que figura en una URL
de `sources` o `offers`. Así conservan su ID, sus especificaciones y las ofertas
de otras tiendas. Las publicaciones nuevas usan un ID `pcfactory-<id>` y muestran
los datos del listado. Sus especificaciones se pueden incorporar en una ficha
manual enlazada por URL.

## Especificaciones de CPU Intel y AMD

El servidor consulta [CPU-Monkey](https://www.cpu-monkey.com/en/) en segundo
plano y conserva en memoria las fichas encontradas. Los nombres de los anuncios
sirven para identificar el modelo. El precio, el stock y el enlace de la oferta
provienen de la tienda. Las fichas manuales tienen prioridad sobre los datos
de CPU-Monkey. Un modelo sin coincidencia exacta conserva su oferta y puede
mostrar una ficha sin especificaciones.

El scraper consulta una ficha por vez y pausa el barrido si la fuente responde
con HTTP 429. Los datos reunidos antes de la pausa se publican en el catálogo.

Para consultar una ficha de forma independiente desde `backend`:

```bash
deno task scrape:cpu-specs "Intel Core i5-14400F"
deno task scrape:cpu-specs "AMD Ryzen 5 5500"
```

## Consultar un producto de PC Factory

Desde `backend`, ejecutar:

```bash
deno task scrape:pcfactory 46284
```

El número es el ID que aparece al inicio de la URL del producto, por ejemplo
`/producto/46284-amd-cpu-amd-ryzen-5-5500-am4`. El comando consulta la API que usa
la tienda y muestra tres respuestas JSON: `product`, `price` y `stock`.

Los precios se distinguen en `price.precio.efectivo`, `debito` y `normal`. El stock
se devuelve por sucursal en `stock.disponibilidad`; tener unidades en una tienda
física no implica disponibilidad en Internet.

## Guardar una oferta en data.json

Desde `backend`, ejecutar:

```bash
deno task import:pcfactory 46284
```

El comando valida las respuestas y guarda el precio en efectivo en `offers` del
producto que tenga la URL de PC Factory en `sources` o en una oferta de PC
Factory ya guardada. Por ejemplo, el Ryzen 5 5500 ya está asociado mediante:

```json
{
  "name": "PC Factory",
  "url": "https://www.pcfactory.cl/producto/46284-amd-cpu-amd-ryzen-5-5500-am4"
}
```

Si se ejecuta otra vez, actualiza la oferta de PC Factory; conserva las otras
tiendas, las especificaciones y el resto del catálogo. `inStock` corresponde a
la sucursal Internet (ID 3000 si está presente, ID 11 en su defecto). Una
sucursal cerrada o una cantidad menor o igual a cero se guarda como sin stock.
Por eso un precio guardado puede seguir mostrándose como “Precio no disponible”
si no hay stock en Internet.

Para otro componente, primero crear su ficha en `data.json` con sus especificaciones
y agregar la URL limpia de la tienda a `sources`, sin `?origin=PCF`. Si no hay una
asociación única, falla sin modificar el archivo. También falla si la respuesta
no incluye un precio o stock válidos. La escritura usa un archivo temporal para
evitar dejar `data.json` incompleto si se interrumpe.

Las especificaciones se mantienen manualmente, con fuentes del fabricante. El
importador solo actualiza la oferta. Los endpoints de la tienda no están
documentados y pueden cambiar. Ejecutar una importación a la vez.
