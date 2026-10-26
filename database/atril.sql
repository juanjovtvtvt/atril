/*
  Atril: base de datos del lector de libros.
  Se puede correr varias veces: crea lo que falte y no borra datos.

  sqlcmd -S localhost\SQLEXPRESS -E -C -i database\atril.sql
*/
SET NOCOUNT ON;
GO

IF DB_ID(N'Atril') IS NULL
    CREATE DATABASE Atril;
GO

USE Atril;
GO

/* ---------- Libros ---------- */
IF OBJECT_ID(N'dbo.Libros', N'U') IS NULL
CREATE TABLE dbo.Libros (
    Id              UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Libros PRIMARY KEY,
    Titulo          NVARCHAR(400)    NOT NULL,
    Autor           NVARCHAR(300)    NOT NULL,
    Idioma          NVARCHAR(20)     NOT NULL CONSTRAINT DF_Libros_Idioma DEFAULT (N''),
    Origen          VARCHAR(4)       NOT NULL CONSTRAINT CK_Libros_Origen CHECK (Origen IN ('epub', 'pdf')),
    NombreArchivo   NVARCHAR(400)    NOT NULL,
    TamanoBytes     BIGINT           NOT NULL CONSTRAINT CK_Libros_Tamano CHECK (TamanoBytes >= 0),
    Color           CHAR(7)          NOT NULL,
    Palabras        INT              NOT NULL CONSTRAINT DF_Libros_Palabras DEFAULT (0),
    Capitulos       INT              NOT NULL CONSTRAINT DF_Libros_Capitulos DEFAULT (0),
    -- Índice del EPUB como JSON: [{ "label": "...", "href": "..." }]
    Indice          NVARCHAR(MAX)    NOT NULL CONSTRAINT DF_Libros_Indice DEFAULT (N'[]')
                                     CONSTRAINT CK_Libros_Indice CHECK (ISJSON(Indice) = 1),
    PrimerasLineas  NVARCHAR(1000)   NOT NULL CONSTRAINT DF_Libros_PrimerasLineas DEFAULT (N''),
    Progreso        DECIMAL(7, 6)    NOT NULL CONSTRAINT DF_Libros_Progreso DEFAULT (0)
                                     CONSTRAINT CK_Libros_Progreso CHECK (Progreso BETWEEN 0 AND 1),
    Cfi             NVARCHAR(1000)   NULL,      -- posición exacta dentro del EPUB
    CapituloActual  NVARCHAR(400)    NOT NULL CONSTRAINT DF_Libros_CapituloActual DEFAULT (N''),
    Ubicaciones     NVARCHAR(MAX)    NULL,      -- caché de epub.js para calcular porcentajes
    AgregadoEn      DATETIME2(3)     NOT NULL CONSTRAINT DF_Libros_AgregadoEn DEFAULT (SYSUTCDATETIME()),
    UltimaLectura   DATETIME2(3)     NULL,
    TerminadoEn     DATETIME2(3)     NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Libros_UltimaLectura')
    CREATE INDEX IX_Libros_UltimaLectura ON dbo.Libros (UltimaLectura DESC);
GO

/* Archivos pesados en tablas aparte: listar la biblioteca nunca carga megabytes. */
IF OBJECT_ID(N'dbo.Portadas', N'U') IS NULL
CREATE TABLE dbo.Portadas (
    LibroId         UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Portadas PRIMARY KEY
                    CONSTRAINT FK_Portadas_Libros REFERENCES dbo.Libros (Id) ON DELETE CASCADE,
    TipoContenido   VARCHAR(50)      NOT NULL,
    Datos           VARBINARY(MAX)   NOT NULL
);
GO

IF OBJECT_ID(N'dbo.ArchivosLibro', N'U') IS NULL
CREATE TABLE dbo.ArchivosLibro (
    LibroId         UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ArchivosLibro PRIMARY KEY
                    CONSTRAINT FK_ArchivosLibro_Libros REFERENCES dbo.Libros (Id) ON DELETE CASCADE,
    Datos           VARBINARY(MAX)   NOT NULL   -- el .epub completo
);
GO

/* Texto plano del libro, para buscar "una frase que recuerdes". */
IF OBJECT_ID(N'dbo.TextosLibro', N'U') IS NULL
CREATE TABLE dbo.TextosLibro (
    LibroId         UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_TextosLibro PRIMARY KEY
                    CONSTRAINT FK_TextosLibro_Libros REFERENCES dbo.Libros (Id) ON DELETE CASCADE,
    Texto           NVARCHAR(MAX)    NOT NULL
);
GO

/* ---------- Lectura ---------- */
IF OBJECT_ID(N'dbo.Sesiones', N'U') IS NULL
CREATE TABLE dbo.Sesiones (
    Id              INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Sesiones PRIMARY KEY,
    LibroId         UNIQUEIDENTIFIER NOT NULL
                    CONSTRAINT FK_Sesiones_Libros REFERENCES dbo.Libros (Id) ON DELETE CASCADE,
    Inicio          DATETIME2(3)     NOT NULL,
    Fin             DATETIME2(3)     NOT NULL,
    Minutos         DECIMAL(9, 2)    NOT NULL CONSTRAINT CK_Sesiones_Minutos CHECK (Minutos >= 0),
    Palabras        INT              NOT NULL CONSTRAINT CK_Sesiones_Palabras CHECK (Palabras >= 0),
    Dia             DATE             NOT NULL,  -- día local del lector (una sesión a las 11 p. m. es de ese día)
    CONSTRAINT CK_Sesiones_Rango CHECK (Fin >= Inicio)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Sesiones_Dia')
    CREATE INDEX IX_Sesiones_Dia ON dbo.Sesiones (Dia) INCLUDE (Minutos, Palabras, LibroId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Sesiones_Libro')
    CREATE INDEX IX_Sesiones_Libro ON dbo.Sesiones (LibroId) INCLUDE (Minutos, Palabras);
GO

IF OBJECT_ID(N'dbo.Subrayados', N'U') IS NULL
CREATE TABLE dbo.Subrayados (
    Id              UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Subrayados PRIMARY KEY,
    LibroId         UNIQUEIDENTIFIER NOT NULL
                    CONSTRAINT FK_Subrayados_Libros REFERENCES dbo.Libros (Id) ON DELETE CASCADE,
    Cfi             NVARCHAR(1000)   NOT NULL,
    Texto           NVARCHAR(MAX)    NOT NULL,
    Color           VARCHAR(5)       NOT NULL CONSTRAINT CK_Subrayados_Color CHECK (Color IN ('ocre', 'oliva', 'rosa')),
    Nota            NVARCHAR(MAX)    NOT NULL CONSTRAINT DF_Subrayados_Nota DEFAULT (N''),
    Capitulo        NVARCHAR(400)    NOT NULL CONSTRAINT DF_Subrayados_Capitulo DEFAULT (N''),
    CreadoEn        DATETIME2(3)     NOT NULL CONSTRAINT DF_Subrayados_CreadoEn DEFAULT (SYSUTCDATETIME())
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Subrayados_Libro')
    CREATE INDEX IX_Subrayados_Libro ON dbo.Subrayados (LibroId, CreadoEn);
GO

IF OBJECT_ID(N'dbo.Marcadores', N'U') IS NULL
CREATE TABLE dbo.Marcadores (
    Id              UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Marcadores PRIMARY KEY,
    LibroId         UNIQUEIDENTIFIER NOT NULL
                    CONSTRAINT FK_Marcadores_Libros REFERENCES dbo.Libros (Id) ON DELETE CASCADE,
    Cfi             NVARCHAR(1000)   NOT NULL,
    Etiqueta        NVARCHAR(400)    NOT NULL CONSTRAINT DF_Marcadores_Etiqueta DEFAULT (N''),
    CreadoEn        DATETIME2(3)     NOT NULL CONSTRAINT DF_Marcadores_CreadoEn DEFAULT (SYSUTCDATETIME())
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Marcadores_Libro')
    CREATE INDEX IX_Marcadores_Libro ON dbo.Marcadores (LibroId);
GO

/*
  Preferencias del lector (tema, tamaño de letra, meta anual...). Valor en JSON.
  Sin CHECK ISJSON: sin su segundo parámetro rechaza valores sueltos como 12 o "sepia".
*/
IF OBJECT_ID(N'dbo.Ajustes', N'U') IS NULL
CREATE TABLE dbo.Ajustes (
    Clave           VARCHAR(50)      NOT NULL CONSTRAINT PK_Ajustes PRIMARY KEY,
    Valor           NVARCHAR(MAX)    NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Ajustes WHERE Clave = 'metaAnual')
    INSERT INTO dbo.Ajustes (Clave, Valor) VALUES ('metaAnual', N'12');
GO

/* ---------- Vistas para consultar desde SSMS ---------- */
CREATE OR ALTER VIEW dbo.vw_Biblioteca AS
SELECT
    l.Id,
    l.Titulo,
    l.Autor,
    l.Origen,
    CAST(l.Progreso * 100 AS DECIMAL(5, 1)) AS Porcentaje,
    CASE
        WHEN l.TerminadoEn IS NOT NULL THEN N'Leído'
        WHEN l.Progreso > 0 THEN N'Leyendo'
        ELSE N'Por leer'
    END AS Estado,
    l.Palabras,
    l.TamanoBytes,
    l.AgregadoEn,
    l.UltimaLectura,
    (SELECT COUNT(*) FROM dbo.Subrayados s WHERE s.LibroId = l.Id) AS Subrayados
FROM dbo.Libros AS l;
GO

CREATE OR ALTER VIEW dbo.vw_MinutosPorDia AS
SELECT Dia, SUM(Minutos) AS Minutos, SUM(Palabras) AS Palabras, COUNT(*) AS Sesiones
FROM dbo.Sesiones
GROUP BY Dia;
GO

/* Palabras por minuto de cada libro. Con menos de 2 minutos leídos no se calcula: no dice nada. */
CREATE OR ALTER VIEW dbo.vw_RitmoPorLibro AS
SELECT
    l.Id,
    l.Titulo,
    SUM(s.Minutos)  AS Minutos,
    SUM(s.Palabras) AS Palabras,
    CAST(SUM(s.Palabras) / NULLIF(SUM(s.Minutos), 0) AS INT) AS PalabrasPorMinuto
FROM dbo.Libros AS l
JOIN dbo.Sesiones AS s ON s.LibroId = l.Id
GROUP BY l.Id, l.Titulo
HAVING SUM(s.Minutos) >= 2 AND SUM(s.Palabras) > 0;
GO

/*
  Racha actual y mejor racha (días seguidos con al menos 1 minuto de lectura).
  Técnica de "islas": a días consecutivos, Dia - ROW_NUMBER() da la misma fecha,
  así que agrupar por esa diferencia junta cada racha.
  @Hoy es el día local del cliente; si no se pasa, se usa la fecha del servidor.
*/
CREATE OR ALTER PROCEDURE dbo.usp_Racha
    @Hoy DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @Hoy = COALESCE(@Hoy, CAST(GETDATE() AS DATE));

    WITH Dias AS (
        SELECT Dia FROM dbo.vw_MinutosPorDia WHERE Minutos >= 1 AND Dia <= @Hoy
    ),
    Islas AS (
        SELECT Dia, DATEADD(DAY, -ROW_NUMBER() OVER (ORDER BY Dia), Dia) AS Grupo
        FROM Dias
    ),
    Rachas AS (
        SELECT MIN(Dia) AS Desde, MAX(Dia) AS Hasta, COUNT(*) AS Dias
        FROM Islas
        GROUP BY Grupo
    )
    SELECT
        -- No haber leído todavía hoy no rompe la racha: dura hasta medianoche.
        RachaActual = COALESCE((SELECT MAX(Dias) FROM Rachas WHERE Hasta >= DATEADD(DAY, -1, @Hoy)), 0),
        MejorRacha  = COALESCE((SELECT MAX(Dias) FROM Rachas), 0),
        LeyoHoy     = CAST(CASE WHEN EXISTS (SELECT 1 FROM Dias WHERE Dia = @Hoy) THEN 1 ELSE 0 END AS BIT);
END;
GO

PRINT N'Base Atril lista.';
GO
