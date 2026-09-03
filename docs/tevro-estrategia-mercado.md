# Tevro — a qué público apuntar

Documento de trabajo. Es una recomendación, no una verdad: sirve para decidir qué
construir y a quién llamar en los próximos seis meses.

## Qué tenés hoy, en términos de mercado

Dos productos que la mayoría de los competidores tiene por separado:

1. **CRM de WhatsApp** (repo `CRM`): línea oficial de Meta, bot, derivación por
   puesto/departamento/disponibilidad, traspaso a persona.
2. **Operaciones** (este repo): inventario con código de barras y movimientos
   atribuidos, fichas/familias/variaciones, costo real de fabricación (materiales +
   mano de obra + extras, margen y precio sugerido), recursos de mano de obra,
   presupuestos, tablero de pedidos con estado interno y estado de cara al cliente,
   automatizaciones, dashboards, IA con tools sobre datos reales, e integración con
   Alegra (ítems, cotizaciones, importación).

Lo defendible no es ninguna de las dos por separado —de CRMs de WhatsApp hay
decenas, de inventarios también— sino **el hilo completo**: la conversación se
convierte en pedido, el pedido descuenta stock según receta y termina en una factura
de Alegra, y el cliente consulta el estado por el mismo WhatsApp. Ese hilo es el
producto.

## Público objetivo recomendado

### Primario: PyME que fabrica a pedido, en LatAm hispanohablante

Perfil concreto:

- 3 a 50 personas, con taller propio.
- Produce **a pedido / a medida**, no en serie de catálogo: herrería y aberturas,
  carpintería y muebles a medida, iluminación (el cliente actual), gráfica e
  impresión, textil, marroquinería, metalmecánica liviana.
- Vende y cotiza **por WhatsApp**, y ese canal ya se le desbordó.
- Factura con Alegra o puede hacerlo (Alegra acota geografía: Colombia, Argentina,
  Perú, México, Costa Rica, República Dominicana → **empezar por Argentina y
  Colombia**).
- Hoy convive con: 2–3 celulares, un Excel de stock desactualizado, presupuestos
  hechos a ojo y una recarga manual en el sistema contable.

Por qué este perfil:

- Tiene los cuatro dolores a la vez, y son los cuatro que ya resolviste.
- **Nadie lo atiende bien.** Los ERP de fabricación son caros y pesados para este
  tamaño; los CRM de WhatsApp no saben nada de producción; los inventarios genéricos
  no calculan costo de fabricación con mano de obra.
- El costeo real es lo que más se paga en este rubro: el que cotiza a ojo pierde
  plata en cada trabajo y lo sabe.
- Es el rubro del cliente que ya tenés: cada implementación siguiente cuesta menos y
  el caso de referencia sirve.

### Secundario (más volumen, menos profundidad): comercio o distribuidor que vende por WhatsApp

El bot levanta el pedido contra catálogo y stock, descuenta y factura. Barrera de
entrada más baja, ciclo de venta más corto — pero mucha más competencia y menos
diferencial. Sirve para hacer volumen **después**, con el CRM como puerta de entrada.

### A quién no apuntar todavía

- Retail de mostrador que necesita punto de venta con caja y turnos.
- Empresas que ya tienen ERP y solo quieren reemplazar un pedazo (integración cara,
  venta larga).
- E-commerce puro: Tiendanube/Shopify ya lo resuelven.
- Empresas grandes o multiempresa con sucursales: hoy no sos multitenant, y prometer
  eso te compra un problema.

## Posicionamiento

> **Tevro es el sistema operativo de la PyME que fabrica y vende por WhatsApp.**
> Del mensaje a la factura, sin planillas en el medio.

No te posiciones como "CRM con IA" (categoría saturada, comparación por precio) ni
como "sistema de inventario" (comparación con software de USD 15/mes). Posicionate
por el recorrido completo del pedido, que es lo que el competidor no tiene.

## Camino comercial, dado que todavía está verde

**Fase 0 — ahora a ~3 meses. Clientes fundadores.**
Cinco empresas del mismo rubro que el cliente actual (o vecino: herrería, aberturas,
carpintería). Instalación dedicada por cliente, como ya funciona hoy: no hace falta
multitenancy para vender cinco. Objetivos: validar precio, endurecer el producto
contra operaciones reales distintas y sacar dos casos contables.

**Fase 1 — multitenancy donde importa.**
El CRM es lo que se vende solo y lo primero que conviene volver multitenant y
self-serve. Operaciones puede seguir siendo implementación acompañada bastante más
tiempo: la carga de recetas de producto es un trabajo humano, y cobrarla está bien.

**Fase 2 — verticalizar.**
Plantillas por rubro (recetas típicas de herrería, de carpintería), que es lo que
baja el costo de implementación de semanas a días. Ese es el momento de escalar.

## Precio (hipótesis a validar en Fase 0)

En rangos de LatAm, por empresa y por mes:

| Concepto | Rango a probar |
|---|---|
| Conversaciones (CRM + bot, ~3 usuarios) | USD 49 – 99 |
| Operaciones (inventario + costos + pedidos) | USD 99 – 199 |
| Suite completa | USD 149 – 279 |
| Implementación inicial (una vez) | USD 300 – 800 |

Cobrá la implementación desde el primer cliente pago, aunque sea poco: es lo que
separa a un cliente de alguien probando gratis, y es trabajo real.

## La landing

Está en `landing/` (ver `landing/README.md`). Decisiones que tomé y por qué:

- **El CTA es una demo por WhatsApp, no un registro.** No sos self-serve todavía, y
  además el canal es el producto: pedir la demo por WhatsApp es la primera prueba.
- **No hay precios.** En Fase 0 el precio se cierra por conversación; publicar un
  número ahora te ata antes de haber validado nada.
- **Hay una sección de "no te sirve si".** Filtra los leads que te harían perder
  semanas y sube la credibilidad del resto de la página.
- **Ningún número inventado.** No hay "ahorrá un 40%" ni testimonios: no tenés la
  medición todavía. Cuando la tengas, ese es el mejor lugar para ponerla.
