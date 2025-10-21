import { sql, resetTable, enableAutovacuum } from "../database";
import { generateLargeJsonb, getUpdateTimestampQuery } from "../fixtures";
import { getTableStats, getTableSize, formatNumber, formatBytes } from "../metrics";

export async function run() {
  console.log("\n=== Scenario 4: Autovacuum Effectiveness ===\n");

  const tableName = "autovacuum_test";
  await resetTable(tableName);
  await enableAutovacuum(tableName);
  await sql.unsafe(`UPDATE ${tableName} SET data = '${JSON.stringify(generateLargeJsonb())}'::jsonb WHERE id = 1`);

  const durationSeconds = 60;
  const samples: Array<{
    elapsed: number;
    deadTuples: number;
    tableSize: number;
    autovacuumCount: number;
  }> = [];

  console.log(`  Running updates for ${durationSeconds} seconds with autovacuum enabled...`);
  console.log(`  Sampling metrics every 5 seconds...\n`);

  const startTime = Date.now();
  let updateCount = 0;
  let lastSampleTime = startTime;

  while (Date.now() - startTime < durationSeconds * 1000) {
    await sql.unsafe(getUpdateTimestampQuery(tableName));
    updateCount++;

    const elapsed = Date.now() - lastSampleTime;
    if (elapsed >= 5000) {
      const stats = await getTableStats(tableName);
      const size = await getTableSize(tableName);
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

      samples.push({
        elapsed: elapsedSeconds,
        deadTuples: stats.n_dead_tup,
        tableSize: size,
        autovacuumCount: stats.autovacuum_count,
      });

      console.log(
        `  [${elapsedSeconds}s] Dead tuples: ${formatNumber(stats.n_dead_tup)}, ` +
        `Table size: ${formatBytes(size)}, ` +
        `Autovacuum runs: ${stats.autovacuum_count}`
      );

      lastSampleTime = Date.now();
    }
  }

  const finalStats = await getTableStats(tableName);
  const finalSize = await getTableSize(tableName);
  const peakDeadTuples = Math.max(...samples.map((s) => s.deadTuples));
  const finalTableSize = samples[samples.length - 1]?.tableSize || finalSize;

  console.log(`\n  Summary:`);
  console.log(`    Total updates: ${formatNumber(updateCount)}`);
  console.log(`    Updates per second: ${(updateCount / durationSeconds).toFixed(2)}`);
  console.log(`    Peak dead tuples: ${formatNumber(peakDeadTuples)}`);
  console.log(`    Final dead tuples: ${formatNumber(finalStats.n_dead_tup)}`);
  console.log(`    Autovacuum runs: ${finalStats.autovacuum_count}`);
  console.log(`    Final table size: ${formatBytes(finalTableSize)}`);

  await sql`DROP TABLE IF EXISTS ${sql(tableName)}`;

  return {
    durationSeconds,
    totalUpdates: updateCount,
    updatesPerSecond: updateCount / durationSeconds,
    peakDeadTuples,
    finalDeadTuples: finalStats.n_dead_tup,
    autovacuumRuns: finalStats.autovacuum_count,
    finalTableSize,
    samples,
  };
}
