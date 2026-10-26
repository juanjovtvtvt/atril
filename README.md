# Atril

Lector de libros EPUB para PC y celular, con convertidor de PDF a EPUB, historial de lectura y notas.

Por ahora el repositorio tiene el **diseño**: un prototipo interactivo con todas las pantallas. El código de la app viene después.

## Estructura

```
diseno/
  canvas.json            Índice del lienzo: posición y tamaño de cada pantalla
  Main.dc.html           Inicio (PC)
  Ficha.dc.html          Ficha del libro, antes de leer
  Lector-PC.dc.html      Lector (PC)
  Convertidor.dc.html    Convertidor PDF → EPUB
  Historial.dc.html      Historial (se abre desde «Esta semana»)
  Biblioteca-PC.dc.html  Biblioteca (PC)
  Notas-PC.dc.html       Notas y subrayados (PC)
  Inicio-Movil.dc.html   Inicio (celular)
  Biblioteca-Movil.dc.html
  Lector-Movil.dc.html
```

Los `.dc.html` son pantallas del lienzo de diseño de claude.ai: dependen de su runtime (`support.js`), así que no se ven abriéndolos sueltos en el navegador.

## Dirección de diseño

- Fuente del sistema (SF Pro en Mac, Segoe UI Variable en Windows); serif solo en el texto de los libros.
- Paleta cálida: fondo `#F7F2EA`, tinta `#2B2119`, acento `#A8261B`, y pasteles oliva, ocre, rosa y arena.
- Menús y ventanas que salen del botón que los abre; botones con `scale(0.97)` al presionar.
- Animaciones de 160–360 ms con `cubic-bezier(.23, 1, .32, 1)`. La animación de la racha es la única más larga (≈1,5 s).
- Basado en las skills `apple-design` y `emil-design-eng` de [emilkowalski/skills](https://github.com/emilkowalski/skills).

## Stack previsto

React + TypeScript + Vite, foliate-js (motor EPUB), pdf.js (lectura de PDF), Dexie/IndexedDB (todo se guarda en el equipo) y PWA para instalarla en el celular.
