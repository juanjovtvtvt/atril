import sql from 'mssql/msnodesqlv8.js';

/*
 * Connects over ODBC with Windows authentication (Trusted_Connection), the same way sqlcmd -E
 * does. That avoids enabling TCP/IP or SQL logins on SQL Server Express: locally it goes over
 * shared memory. Override with the ATRIL_DB variable to point at another server.
 */
const connectionString =
  process.env.ATRIL_DB ??
  String.raw`Driver={ODBC Driver 18 for SQL Server};Server=localhost\SQLEXPRESS;Database=Atril;Trusted_Connection=Yes;TrustServerCertificate=Yes;`;

let poolPromise: Promise<sql.ConnectionPool> | null = null;

export function getPool() {
  poolPromise ??= new sql.ConnectionPool({ connectionString } as unknown as sql.config).connect().catch((err: unknown) => {
    poolPromise = null;
    throw err;
  });
  return poolPromise;
}

export async function request() {
  return (await getPool()).request();
}

export { sql };
