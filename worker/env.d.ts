// Schema files are bundled as text (Vite ?raw imports) and applied inside each character database.
declare module "*.sql?raw" {
  const sql: string;
  export default sql;
}
