# pausabater13.github.io

Web personal de Pau Sabater Nácher. Dos formas de leer el mismo contenido:

- **El mundo** (por defecto): un pequeño planeta en three.js por el que se conduce; cada lugar de la trayectoria es un escenario 3D con su tarjeta y sus enlaces.
- **La versión formal** (botón ×, o `/#formal`): un documento HTML estático con publicaciones, trayectoria y contacto. Es lo que ven los buscadores, las vistas previas de enlaces y quien navega sin JavaScript o sin WebGL.

Se publica con GitHub Pages desde `master` (raíz). No hay paso de compilación en el despliegue.

## Estructura

```
index.html                 Página: metadatos, versión formal (generada) y la interfaz del mundo
data/content.js            Contenido: perfil, publicaciones y lugares (única fuente de verdad)
assets/css/site.css        Estilos del mundo y de la versión formal
assets/js/ui.js            Interfaz HTML: lista, tarjeta, avisos, paso a la versión formal
assets/js/world.js         Mundo 3D: planeta, vehículos, escenarios, brújula y minimapa
assets/vendor/             three.js 0.170.0, d3-geo 3.1.1, topojson-client 3.1.0, world-atlas 2.0.2 (con sus licencias)
assets/img/                favicon e imagen para redes (og.jpg)
assets/pdf/resume.pdf      CV
scripts/build.mjs          Regenera la versión formal de index.html desde data/content.js
grocery_opportunities/     Proyecto Python con su página y una GitHub Action semanal
```

## Añadir o editar un lugar

1. Edita `data/content.js` y añade un objeto a `ITEMS`:
   - `id`, `cat` (sección de la versión formal), `kind` (escenario 3D), `yr`, `place`, `what`, `text`
   - `at: [lon, lat]`: posición en el planeta. Si cae a menos de ~3° de otro lugar, sepárala para que se puedan visitar por separado.
   - `links: [['Texto', 'https://…']]`; lo que falte por confirmar va en `pending`.
   - Opcional: `rel` (ids relacionados, dibuja arcos), `note`, `label`.
2. Si quieres un escenario nuevo, añade una función a `builders` en `assets/js/world.js` (y un icono en `ICONS`). Si no, reutiliza un `kind` existente.
3. Regenera la versión formal:

   ```bash
   node scripts/build.mjs
   ```

Regla de contenido: solo hechos verificables, con enlace. Nada inventado; lo pendiente se marca como tal.

## Probar en local

```bash
python3 -m http.server 8790 --bind 127.0.0.1
```

y abre <http://127.0.0.1:8790/>. Con `#formal` al final se abre la versión formal.

## Rendimiento

- Sin modelos 3D descargados: toda la geometría se genera en código. three.js es el único peso grande (~170 KB comprimido).
- El HTML de la versión formal se pinta antes de que cargue el 3D; si WebGL falla, se muestra la versión formal.
- En móvil o equipos de ≤4 núcleos: menos resolución y sin sombras. Se respeta `prefers-reduced-motion`.

## Licencias de terceros

three.js (MIT), d3-array / d3-geo / topojson-client / world-atlas (ISC); los textos están en `assets/vendor/`. Los contornos de tierra proceden de Natural Earth (dominio público).
