# Atril

Lector de libros EPUB para PC y celular, con convertidor de PDF a EPUB, historial de lectura, racha, subrayados y notas. Los datos se guardan en **SQL Server**.

```
Navegador (React)  ──/api──▶  Servidor Node (Express)  ──ODBC──▶  SQL Server (Atril)
  lector EPUB                  server/index.ts                     tablas, vistas y usp_Racha
  conversión PDF→EPUB          autenticación de Windows
```

El PDF se convierte en el navegador. A la base solo llega el EPUB resultante, con su texto para la búsqueda.

## Requisitos

- **Node 22 o superior**
- **SQL Server** (Express sirve) en `localhost\SQLEXPRESS`
- **ODBC Driver 17 o 18 for SQL Server**, que normalmente se instala con SQL Server

El servidor entra con **autenticación de Windows**, igual que `sqlcmd -E` o SSMS. No hace falta activar TCP/IP ni crear usuarios de SQL.

## Arrancar

```bash
npm install
npm run db      # crea la base Atril (se puede correr varias veces, no borra datos)
npm run dev     # API en :3001 y la app en http://localhost:5173
```

**En el celular:** conéctalo a la misma Wi-Fi y abre la dirección «Network» que muestra Vite (algo como `http://192.168.1.20:5173`). Desde el menú del navegador puedes instalarla como app.

**Versión compilada:** `npm run build` y luego `npm start` sirven todo junto en `http://localhost:3001`.

**Otra instancia o base:** define `ATRIL_DB` con la cadena de conexión ODBC completa antes de arrancar.

## La base de datos

`database/atril.sql` crea:

| Objeto | Para qué |
|---|---|
| `Libros` | Título, autor, progreso, posición (CFI), capítulo actual, fechas |
| `ArchivosLibro` | El `.epub` completo (`VARBINARY(MAX)`) |
| `Portadas` | La portada del EPUB, si trae |
| `TextosLibro` | Texto plano, para buscar «una frase que recuerdes» sin importar tildes |
| `Sesiones` | Cada rato de lectura: minutos activos, palabras y día |
| `Subrayados` | Texto, color (ocre, oliva, rosa), nota y capítulo |
| `Marcadores` | Páginas guardadas |
| `Ajustes` | Preferencias del lector y meta anual (JSON) |
| `vw_Biblioteca` | Cada libro con su porcentaje, estado y cantidad de subrayados |
| `vw_MinutosPorDia` | Minutos y palabras por día |
| `vw_RitmoPorLibro` | Palabras por minuto de cada libro |
| `usp_Racha` | Racha actual y mejor racha, con la técnica de islas (`Dia - ROW_NUMBER()`) |

Todo lo que cuelga de un libro se borra en cascada al eliminarlo.

Para mirarla desde SSMS:

```sql
USE Atril;
SELECT * FROM dbo.vw_Biblioteca;
SELECT * FROM dbo.vw_RitmoPorLibro;
EXEC dbo.usp_Racha;
```

## Estructura

```
src/
  pages/        Inicio, Ficha, Lector, Convertidor, Historial, Biblioteca, Notas
  components/   Barra, panel lateral, hojas, menús, portada, animación de la racha
  lib/          pdfToEpub (heurísticas), buildEpub (JSZip), epub (análisis), stats, share
  api.ts        Llamadas a la API y un hook que recarga los datos cuando algo cambia
server/         API Express + mssql/msnodesqlv8
database/       Script de la base
diseno/         Prototipo de las pantallas (lienzo de claude.ai)
```

## Cómo convierte un PDF

Un PDF no tiene párrafos, solo texto ubicado en coordenadas. El convertidor:

1. Arma líneas a partir de las coordenadas de cada fragmento (pdf.js).
2. Quita el texto que se repite arriba o abajo en muchas páginas: encabezados y números de página.
3. Une las líneas en párrafos según el espacio vertical, la sangría y el final de oración.
4. Junta palabras cortadas con guion al final de línea.
5. Detecta títulos por tamaño de letra y divide los capítulos con ellos.
6. Empaqueta un EPUB 3 (con `toc.ncx` para lectores viejos).

**Limitaciones conocidas:**

- Los PDF escaneados necesitan OCR, que todavía no está.
- Los PDF a dos columnas o con tablas pueden salir desordenados.
- La app necesita el servidor y SQL Server encendidos: no funciona sin conexión.

## Diseño

- Fuente del sistema (SF Pro en Mac, Segoe UI Variable en Windows); serif solo en el texto de los libros.
- Paleta cálida y modo oscuro automático.
- Menús que salen del botón que los abre.
- Animaciones de 160–360 ms con `cubic-bezier(.23, 1, .32, 1)`; respeta `prefers-reduced-motion`.
- Basado en las skills `apple-design` y `emil-design-eng` de [emilkowalski/skills](https://github.com/emilkowalski/skills).
