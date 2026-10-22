## Consultar PC Factory

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
producto que tenga la URL de PC Factory en `sources`. Por ejemplo, el Ryzen 5 5500
ya está asociado mediante:

```json
{
  "name": "PC Factory",
  "url": "https://www.pcfactory.cl/producto/46284-amd-cpu-amd-ryzen-5-5500-am4"
}
```

Si se ejecuta otra vez, actualiza la oferta de PC Factory; conserva las otras
tiendas, las especificaciones y el resto del catálogo. `inStock` corresponde a
la sucursal Internet: el stock de tiendas físicas no habilita esta oferta online.
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
