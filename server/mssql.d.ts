// Node's ESM needs the ".js" extension for mssql's msnodesqlv8 entry; the types only know the bare path.
declare module 'mssql/msnodesqlv8.js' {
  import sql from 'mssql/msnodesqlv8';
  export * from 'mssql/msnodesqlv8';
  export default sql;
}
