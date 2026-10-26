import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, request, sql } from './db.ts';

const app = express();
app.disable('x-powered-by');
app.use('/api', express.json({ limit: '60mb' }));

type Handler = (req: Request, res: Response) => Promise<unknown>;
// Express 4 doesn't catch async errors on its own.
const route = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};

/* SQL Server returns GUIDs in uppercase; the client generates them in lowercase. */
const guid = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : v);
const ms = (v: unknown) => (v instanceof Date ? v.getTime() : null);
const date = (v: unknown) => (typeof v === 'number' ? new Date(v) : null);
const isGuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function idParam(req: Request) {
  const id = req.params.id;
  if (!isGuid(id)) throw new HttpError(400, 'Id inválido');
  return id;
}

/* ---------- Books ---------- */

const bookColumns = `
  l.Id AS id, l.Titulo AS title, l.Autor AS author, l.Idioma AS language, l.Origen AS origin,
  l.NombreArchivo AS fileName, l.TamanoBytes AS fileSize, l.Color AS color, l.Palabras AS wordCount,
  l.Capitulos AS chapterCount, l.Indice AS toc, l.PrimerasLineas AS firstLines, l.Progreso AS progress,
  l.Cfi AS cfi, l.CapituloActual AS chapterLabel, l.AgregadoEn AS addedAt, l.UltimaLectura AS lastOpenedAt,
  l.TerminadoEn AS finishedAt, CAST(CASE WHEN p.LibroId IS NULL THEN 0 ELSE 1 END AS BIT) AS hasCover`;

function mapBook(r: Record<string, unknown>) {
  return {
    ...r,
    id: guid(r.id),
    toc: JSON.parse(String(r.toc ?? '[]')),
    progress: Number(r.progress),
    fileSize: Number(r.fileSize),
    addedAt: ms(r.addedAt),
    lastOpenedAt: ms(r.lastOpenedAt),
    finishedAt: ms(r.finishedAt),
  };
}

app.get('/api/health', route(async (_req, res) => {
  const r = await (await request()).query('SELECT @@SERVERNAME AS server, DB_NAME() AS db, SUSER_SNAME() AS login');
  res.json({ ok: true, ...r.recordset[0] });
}));

app.get('/api/books', route(async (_req, res) => {
  const r = await (await request()).query(`SELECT ${bookColumns} FROM dbo.Libros AS l LEFT JOIN dbo.Portadas AS p ON p.LibroId = l.Id`);
  res.json(r.recordset.map(mapBook));
}));

app.get('/api/books/:id', route(async (req, res) => {
  const r = await (await request())
    .input('id', sql.UniqueIdentifier, idParam(req))
    .query(`SELECT ${bookColumns}, l.Ubicaciones AS locations FROM dbo.Libros AS l LEFT JOIN dbo.Portadas AS p ON p.LibroId = l.Id WHERE l.Id = @id`);
  if (!r.recordset[0]) throw new HttpError(404, 'No existe ese libro');
  res.json(mapBook(r.recordset[0]));
}));

app.post('/api/books', route(async (req, res) => {
  const b = req.body as Record<string, unknown>;
  if (!isGuid(b.id) || typeof b.title !== 'string') throw new HttpError(400, 'Faltan datos del libro');
  const tx = new sql.Transaction(await getPool());
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('id', sql.UniqueIdentifier, b.id)
      .input('titulo', sql.NVarChar(400), String(b.title).slice(0, 400))
      .input('autor', sql.NVarChar(300), String(b.author ?? '').slice(0, 300))
      .input('idioma', sql.NVarChar(20), String(b.language ?? '').slice(0, 20))
      .input('origen', sql.VarChar(4), b.origin === 'pdf' ? 'pdf' : 'epub')
      .input('archivo', sql.NVarChar(400), String(b.fileName ?? '').slice(0, 400))
      .input('tamano', sql.BigInt, Number(b.fileSize ?? 0))
      .input('color', sql.Char(7), String(b.color ?? '#4B2716'))
      .input('palabras', sql.Int, Number(b.wordCount ?? 0))
      .input('capitulos', sql.Int, Number(b.chapterCount ?? 0))
      .input('indice', sql.NVarChar(sql.MAX), JSON.stringify(b.toc ?? []))
      .input('lineas', sql.NVarChar(1000), String(b.firstLines ?? '').slice(0, 1000))
      .query(`INSERT INTO dbo.Libros (Id, Titulo, Autor, Idioma, Origen, NombreArchivo, TamanoBytes, Color, Palabras, Capitulos, Indice, PrimerasLineas)
              VALUES (@id, @titulo, @autor, @idioma, @origen, @archivo, @tamano, @color, @palabras, @capitulos, @indice, @lineas)`);
    await new sql.Request(tx)
      .input('id', sql.UniqueIdentifier, b.id)
      .input('texto', sql.NVarChar(sql.MAX), String(b.text ?? ''))
      .query('INSERT INTO dbo.TextosLibro (LibroId, Texto) VALUES (@id, @texto)');
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
  res.status(201).json({ id: b.id });
}));

const raw = express.raw({ type: () => true, limit: '300mb' });

app.put('/api/books/:id/file', raw, route(async (req, res) => {
  await (await request())
    .input('id', sql.UniqueIdentifier, idParam(req))
    .input('datos', sql.VarBinary(sql.MAX), req.body as Buffer)
    .query(`MERGE dbo.ArchivosLibro AS t USING (SELECT @id AS LibroId) AS s ON t.LibroId = s.LibroId
            WHEN MATCHED THEN UPDATE SET Datos = @datos
            WHEN NOT MATCHED THEN INSERT (LibroId, Datos) VALUES (@id, @datos);`);
  res.status(204).end();
}));

app.put('/api/books/:id/cover', raw, route(async (req, res) => {
  await (await request())
    .input('id', sql.UniqueIdentifier, idParam(req))
    .input('tipo', sql.VarChar(50), String(req.headers['content-type'] ?? 'image/jpeg').slice(0, 50))
    .input('datos', sql.VarBinary(sql.MAX), req.body as Buffer)
    .query(`MERGE dbo.Portadas AS t USING (SELECT @id AS LibroId) AS s ON t.LibroId = s.LibroId
            WHEN MATCHED THEN UPDATE SET Datos = @datos, TipoContenido = @tipo
            WHEN NOT MATCHED THEN INSERT (LibroId, TipoContenido, Datos) VALUES (@id, @tipo, @datos);`);
  res.status(204).end();
}));

app.get('/api/books/:id/file', route(async (req, res) => {
  const r = await (await request()).input('id', sql.UniqueIdentifier, idParam(req)).query('SELECT Datos FROM dbo.ArchivosLibro WHERE LibroId = @id');
  if (!r.recordset[0]) throw new HttpError(404, 'El libro no tiene archivo');
  res.type('application/epub+zip').send(r.recordset[0].Datos);
}));

app.get('/api/books/:id/cover', route(async (req, res) => {
  const r = await (await request()).input('id', sql.UniqueIdentifier, idParam(req)).query('SELECT TipoContenido, Datos FROM dbo.Portadas WHERE LibroId = @id');
  if (!r.recordset[0]) throw new HttpError(404, 'Sin portada');
  res.set('Cache-Control', 'private, max-age=86400').type(r.recordset[0].TipoContenido).send(r.recordset[0].Datos);
}));

/* Only these fields change after import; each maps to its column and SQL type. */
const patchable: Record<string, [string, (v: unknown) => unknown, () => sql.ISqlType]> = {
  progress: ['Progreso', (v) => Math.min(1, Math.max(0, Number(v) || 0)), () => sql.Decimal(7, 6)],
  cfi: ['Cfi', (v) => (v == null ? null : String(v).slice(0, 1000)), () => sql.NVarChar(1000)],
  chapterLabel: ['CapituloActual', (v) => String(v ?? '').slice(0, 400), () => sql.NVarChar(400)],
  lastOpenedAt: ['UltimaLectura', date, () => sql.DateTime2(3)],
  finishedAt: ['TerminadoEn', date, () => sql.DateTime2(3)],
  locations: ['Ubicaciones', (v) => (v == null ? null : String(v)), () => sql.NVarChar(sql.MAX)],
};

app.patch('/api/books/:id', route(async (req, res) => {
  const req2 = (await request()).input('id', sql.UniqueIdentifier, idParam(req));
  const sets: string[] = [];
  for (const [key, value] of Object.entries(req.body as Record<string, unknown>)) {
    const spec = patchable[key];
    if (!spec) continue;
    const [column, convert, type] = spec;
    req2.input(key, type(), convert(value));
    sets.push(`${column} = @${key}`);
  }
  if (sets.length === 0) throw new HttpError(400, 'Nada que actualizar');
  await req2.query(`UPDATE dbo.Libros SET ${sets.join(', ')} WHERE Id = @id`);
  res.status(204).end();
}));

app.delete('/api/books/:id', route(async (req, res) => {
  // ON DELETE CASCADE removes the file, cover, text, sessions, highlights and bookmarks.
  await (await request()).input('id', sql.UniqueIdentifier, idParam(req)).query('DELETE FROM dbo.Libros WHERE Id = @id');
  res.status(204).end();
}));

/* ---------- Search: title, author or a phrase from the text ---------- */

app.get('/api/search', route(async (req, res) => {
  const q = String(req.query.q ?? '').trim().slice(0, 200);
  if (q.length < 2) return res.json([]);
  const like = '%' + q.replace(/[[%_]/g, (c) => `[${c}]`) + '%';
  const r = await (await request())
    .input('q', sql.NVarChar(200), q)
    .input('p', sql.NVarChar(410), like)
    .input('textual', sql.Bit, q.length >= 4)
    .query(`
      SELECT TOP (20) l.Id AS id, l.Titulo AS title, l.Autor AS author,
        CASE WHEN l.Titulo COLLATE Latin1_General_CI_AI LIKE @p OR l.Autor COLLATE Latin1_General_CI_AI LIKE @p THEN 'meta' ELSE 'texto' END AS kind,
        CASE WHEN l.Titulo COLLATE Latin1_General_CI_AI LIKE @p OR l.Autor COLLATE Latin1_General_CI_AI LIKE @p THEN NULL
             ELSE SUBSTRING(t.Texto, IIF(x.pos > 70, x.pos - 70, 1), 220) END AS snippet
      FROM dbo.Libros AS l
      LEFT JOIN dbo.TextosLibro AS t ON t.LibroId = l.Id
      CROSS APPLY (SELECT CHARINDEX(@q, t.Texto COLLATE Latin1_General_CI_AI) AS pos) AS x
      WHERE l.Titulo COLLATE Latin1_General_CI_AI LIKE @p
         OR l.Autor COLLATE Latin1_General_CI_AI LIKE @p
         OR (@textual = 1 AND x.pos > 0)
      ORDER BY CASE WHEN l.Titulo COLLATE Latin1_General_CI_AI LIKE @p THEN 0 ELSE 1 END, l.UltimaLectura DESC`);
  res.json(r.recordset.map((row) => ({ ...row, id: guid(row.id) })));
}));

/* ---------- Reading sessions ---------- */

const mapSession = (r: Record<string, unknown>) => ({
  id: r.id,
  bookId: guid(r.bookId),
  start: ms(r.start),
  end: ms(r.end),
  minutes: Number(r.minutes),
  words: Number(r.words),
  day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day),
});

app.get('/api/sessions', route(async (_req, res) => {
  const r = await (await request()).query('SELECT Id AS id, LibroId AS bookId, Inicio AS start, Fin AS [end], Minutos AS minutes, Palabras AS words, Dia AS day FROM dbo.Sesiones ORDER BY Inicio');
  res.json(r.recordset.map(mapSession));
}));

app.post('/api/sessions', route(async (req, res) => {
  const s = req.body as Record<string, unknown>;
  if (!isGuid(s.bookId) || typeof s.day !== 'string') throw new HttpError(400, 'Sesión inválida');
  const r = await (await request())
    .input('libro', sql.UniqueIdentifier, s.bookId)
    .input('inicio', sql.DateTime2(3), date(s.start))
    .input('fin', sql.DateTime2(3), date(s.end))
    .input('minutos', sql.Decimal(9, 2), Number(s.minutes) || 0)
    .input('palabras', sql.Int, Math.max(0, Math.round(Number(s.words) || 0)))
    .input('dia', sql.Date, s.day)
    .query('INSERT INTO dbo.Sesiones (LibroId, Inicio, Fin, Minutos, Palabras, Dia) OUTPUT INSERTED.Id AS id VALUES (@libro, @inicio, @fin, @minutos, @palabras, @dia)');
  res.status(201).json({ id: r.recordset[0].id });
}));

app.patch('/api/sessions/:id', route(async (req, res) => {
  const s = req.body as Record<string, unknown>;
  await (await request())
    .input('id', sql.Int, Number(req.params.id))
    .input('fin', sql.DateTime2(3), date(s.end))
    .input('minutos', sql.Decimal(9, 2), Number(s.minutes) || 0)
    .input('palabras', sql.Int, Math.max(0, Math.round(Number(s.words) || 0)))
    .query('UPDATE dbo.Sesiones SET Fin = @fin, Minutos = @minutos, Palabras = @palabras WHERE Id = @id');
  res.status(204).end();
}));

/* The streak comes from the stored procedure (gaps-and-islands technique in T-SQL). */
app.get('/api/stats/streak', route(async (req, res) => {
  const today = typeof req.query.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.today) ? req.query.today : null;
  const r = await (await request()).input('Hoy', sql.Date, today).execute('dbo.usp_Racha');
  const row = r.recordset[0] ?? {};
  res.json({ current: row.RachaActual ?? 0, best: row.MejorRacha ?? 0, readToday: !!row.LeyoHoy });
}));

/* ---------- Highlights ---------- */

const mapHighlight = (r: Record<string, unknown>) => ({ ...r, id: guid(r.id), bookId: guid(r.bookId), createdAt: ms(r.createdAt) });
const highlightColors = new Set(['ocre', 'oliva', 'rosa']);

app.get('/api/highlights', route(async (req, res) => {
  const bookId = req.query.bookId;
  const r2 = await request();
  let where = '';
  if (isGuid(bookId)) {
    r2.input('libro', sql.UniqueIdentifier, bookId);
    where = 'WHERE LibroId = @libro';
  }
  const r = await r2.query(`SELECT Id AS id, LibroId AS bookId, Cfi AS cfi, Texto AS text, Color AS color, Nota AS note, Capitulo AS chapter, CreadoEn AS createdAt FROM dbo.Subrayados ${where} ORDER BY CreadoEn`);
  res.json(r.recordset.map(mapHighlight));
}));

app.post('/api/highlights', route(async (req, res) => {
  const h = req.body as Record<string, unknown>;
  if (!isGuid(h.id) || !isGuid(h.bookId) || !highlightColors.has(String(h.color))) throw new HttpError(400, 'Subrayado inválido');
  await (await request())
    .input('id', sql.UniqueIdentifier, h.id)
    .input('libro', sql.UniqueIdentifier, h.bookId)
    .input('cfi', sql.NVarChar(1000), String(h.cfi ?? ''))
    .input('texto', sql.NVarChar(sql.MAX), String(h.text ?? ''))
    .input('color', sql.VarChar(5), h.color)
    .input('nota', sql.NVarChar(sql.MAX), String(h.note ?? ''))
    .input('capitulo', sql.NVarChar(400), String(h.chapter ?? '').slice(0, 400))
    .query('INSERT INTO dbo.Subrayados (Id, LibroId, Cfi, Texto, Color, Nota, Capitulo) VALUES (@id, @libro, @cfi, @texto, @color, @nota, @capitulo)');
  res.status(201).json({ id: h.id });
}));

app.patch('/api/highlights/:id', route(async (req, res) => {
  const h = req.body as Record<string, unknown>;
  const r2 = (await request()).input('id', sql.UniqueIdentifier, idParam(req));
  const sets: string[] = [];
  if (highlightColors.has(String(h.color))) {
    r2.input('color', sql.VarChar(5), h.color);
    sets.push('Color = @color');
  }
  if (typeof h.note === 'string') {
    r2.input('nota', sql.NVarChar(sql.MAX), h.note);
    sets.push('Nota = @nota');
  }
  if (sets.length === 0) throw new HttpError(400, 'Nada que actualizar');
  await r2.query(`UPDATE dbo.Subrayados SET ${sets.join(', ')} WHERE Id = @id`);
  res.status(204).end();
}));

app.delete('/api/highlights/:id', route(async (req, res) => {
  await (await request()).input('id', sql.UniqueIdentifier, idParam(req)).query('DELETE FROM dbo.Subrayados WHERE Id = @id');
  res.status(204).end();
}));

/* ---------- Bookmarks ---------- */

app.get('/api/bookmarks', route(async (req, res) => {
  if (!isGuid(req.query.bookId)) throw new HttpError(400, 'Falta bookId');
  const r = await (await request())
    .input('libro', sql.UniqueIdentifier, req.query.bookId)
    .query('SELECT Id AS id, LibroId AS bookId, Cfi AS cfi, Etiqueta AS label, CreadoEn AS createdAt FROM dbo.Marcadores WHERE LibroId = @libro ORDER BY CreadoEn');
  res.json(r.recordset.map(mapHighlight));
}));

app.post('/api/bookmarks', route(async (req, res) => {
  const m = req.body as Record<string, unknown>;
  if (!isGuid(m.id) || !isGuid(m.bookId)) throw new HttpError(400, 'Marcador inválido');
  await (await request())
    .input('id', sql.UniqueIdentifier, m.id)
    .input('libro', sql.UniqueIdentifier, m.bookId)
    .input('cfi', sql.NVarChar(1000), String(m.cfi ?? ''))
    .input('etiqueta', sql.NVarChar(400), String(m.label ?? '').slice(0, 400))
    .query('INSERT INTO dbo.Marcadores (Id, LibroId, Cfi, Etiqueta) VALUES (@id, @libro, @cfi, @etiqueta)');
  res.status(201).json({ id: m.id });
}));

app.delete('/api/bookmarks/:id', route(async (req, res) => {
  await (await request()).input('id', sql.UniqueIdentifier, idParam(req)).query('DELETE FROM dbo.Marcadores WHERE Id = @id');
  res.status(204).end();
}));

/* ---------- Settings (JSON value per key) ---------- */

app.get('/api/settings', route(async (_req, res) => {
  const r = await (await request()).query('SELECT Clave, Valor FROM dbo.Ajustes');
  const out: Record<string, unknown> = {};
  for (const row of r.recordset) {
    try {
      out[row.Clave] = JSON.parse(row.Valor);
    } catch {
      out[row.Clave] = row.Valor;
    }
  }
  res.json(out);
}));

app.put('/api/settings/:key', route(async (req, res) => {
  const key = String(req.params.key);
  if (!/^[a-zA-Z0-9_.-]{1,50}$/.test(key)) throw new HttpError(400, 'Clave inválida');
  await (await request())
    .input('clave', sql.VarChar(50), key)
    .input('valor', sql.NVarChar(sql.MAX), JSON.stringify((req.body as { value?: unknown }).value ?? null))
    .query(`MERGE dbo.Ajustes AS t USING (SELECT @clave AS Clave) AS s ON t.Clave = s.Clave
            WHEN MATCHED THEN UPDATE SET Valor = @valor
            WHEN NOT MATCHED THEN INSERT (Clave, Valor) VALUES (@clave, @valor);`);
  res.status(204).end();
}));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

/* ---------- Built app (npm start) ---------- */

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : 'Error inesperado';
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? `Error de la base de datos: ${message}` : message });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`API de Atril en http://localhost:${port}/api (SQL Server: Atril)`);
});
