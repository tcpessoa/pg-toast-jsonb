import { SQL } from "bun";

const PORT = 5435 // to avoid conflict with default Postgres port 5432
const connectionString = process.env.DATABASE_URL || `postgres://postgres:postgres@localhost:${PORT}/postgres`;
const sql = new SQL(connectionString);

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  if (params && params.length > 0) {
    const paramPlaceholders = params.map((_, i) => `$${i + 1}`).join(", ");
    const queryText = text.replace(/\$\d+/g, () => paramPlaceholders);
    return await sql.query(queryText, params) as T[];
  }
  return await sql.query(text) as T[];
}

export async function resetTable(tableName: string) {
  await sql`DROP TABLE IF EXISTS ${sql(tableName)} CASCADE`;
  await sql`
    CREATE TABLE ${sql(tableName)} (
      id SERIAL PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`INSERT INTO ${sql(tableName)} (data) VALUES ('{}'::jsonb)`;
}

export async function disableAutovacuum(tableName: string) {
  await sql.unsafe(`ALTER TABLE ${tableName} SET (autovacuum_enabled = false)`);
}

export async function enableAutovacuum(tableName: string) {
  await sql.unsafe(`ALTER TABLE ${tableName} SET (autovacuum_enabled = true)`);
}

export async function vacuum(tableName: string) {
  await sql.unsafe(`VACUUM ${tableName}`);
}

export async function vacuumFull(tableName: string) {
  await sql.unsafe(`VACUUM FULL ${tableName}`);
}

export async function getToastTableName(tableName: string): Promise<string | null> {
  const result = await sql`
    SELECT reltoastrelid
    FROM pg_class
    WHERE relname = ${tableName}
  ` as { reltoastrelid: number }[];

  if (!result[0] || result[0].reltoastrelid === 0) {
    return null;
  }

  const toastResult = await sql`
    SELECT relname
    FROM pg_class
    WHERE oid = ${result[0].reltoastrelid}
  ` as { relname: string }[];

  return toastResult[0]?.relname || null;
}

export async function closeConnection() {
  await sql.close();
}

export { sql };
export default sql;
