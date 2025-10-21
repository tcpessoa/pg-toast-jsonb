import { sql } from "./database";

export interface TableStats {
  n_tup_ins: number;
  n_tup_upd: number;
  n_tup_del: number;
  n_tup_hot_upd: number;
  n_live_tup: number;
  n_dead_tup: number;
  autovacuum_count: number;
  last_autovacuum?: Date;
}

export async function getTableStats(tableName: string): Promise<TableStats> {
  const result = await sql`
    SELECT
      n_tup_ins,
      n_tup_upd,
      n_tup_del,
      n_tup_hot_upd,
      n_live_tup,
      n_dead_tup,
      autovacuum_count,
      last_autovacuum
    FROM pg_stat_user_tables
    WHERE relname = ${tableName}
  ` as TableStats[];

  return result[0] || {
    n_tup_ins: 0,
    n_tup_upd: 0,
    n_tup_del: 0,
    n_tup_hot_upd: 0,
    n_live_tup: 0,
    n_dead_tup: 0,
    autovacuum_count: 0,
  };
}

export async function getTableSize(tableName: string): Promise<number> {
  const result = await sql`
    SELECT pg_total_relation_size(${tableName}::regclass) as size
  ` as { size: string }[];

  return parseInt(result[0]?.size || "0");
}

export async function getToastSize(toastTableName: string): Promise<number> {
  if (!toastTableName) return 0;

  const result = await sql`
    SELECT pg_total_relation_size(${"pg_toast." + toastTableName}::regclass) as size
  ` as { size: string }[];

  return parseInt(result[0]?.size || "0");
}

export function calculateHotRatio(stats: TableStats): number {
  if (stats.n_tup_upd === 0) return 0;
  return stats.n_tup_hot_upd / stats.n_tup_upd;
}

export function calculateBloatRatio(stats: TableStats): number {
  if (stats.n_live_tup === 0) return 0;
  return stats.n_dead_tup / stats.n_live_tup;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function formatNumber(num: number): string {
  return num.toLocaleString();
}
