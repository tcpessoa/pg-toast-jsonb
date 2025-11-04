import { sql, resetTable, enableAutovacuum } from "../database";
import { generateLargeJsonb, getUpdateTimestampQuery } from "../fixtures";
import { getTableStats, getTableSize, formatNumber, formatBytes, getToastTableName, getToastStats, getToastTableSize, getToastBloat } from "../metrics";

export async function run() {
  console.log("\n=== Scenario 2: Autovacuum Effectiveness ===\n");

  const tableName = "autovacuum_test";
  await resetTable(tableName);

  // Enable pgstattuple extension if not already enabled
  await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS pgstattuple`);

  await enableAutovacuum(tableName);
  await sql.unsafe(`UPDATE ${tableName} SET data = '${JSON.stringify(generateLargeJsonb())}'::jsonb WHERE id = 1`);

  const durationSeconds = 60;
  const toastTableName = await getToastTableName(tableName);

  const samples: Array<{
    elapsed: number;
    deadTuples: number;
    tableSize: number;
    autovacuumCount: number;
    toastDeadTuples: number;
    toastTableSize: number;
    toastAutovacuumCount: number;
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
      const toastStats = toastTableName ? await getToastStats(toastTableName) : null;
      const toastSize = toastTableName ? await getToastTableSize(tableName) : 0;
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

      samples.push({
        elapsed: elapsedSeconds,
        deadTuples: stats.n_dead_tup,
        tableSize: size,
        autovacuumCount: stats.autovacuum_count,
        toastDeadTuples: toastStats?.n_dead_tup || 0,
        toastTableSize: toastSize,
        toastAutovacuumCount: toastStats?.autovacuum_count || 0,
      });

      console.log(
        `  [${elapsedSeconds}s] Main: ${formatNumber(stats.n_dead_tup)} dead (${formatBytes(size)}), ` +
        `TOAST: ${formatNumber(toastStats?.n_dead_tup || 0)} dead (${formatBytes(toastSize)}), ` +
        `AV runs: ${stats.autovacuum_count}/${toastStats?.autovacuum_count || 0}`
      );

      lastSampleTime = Date.now();
    }
  }

  const finalStats = await getTableStats(tableName);
  const finalSize = await getTableSize(tableName);
  const finalToastStats = toastTableName ? await getToastStats(toastTableName) : null;
  const finalToastSize = toastTableName ? await getToastTableSize(tableName) : 0;
  const peakDeadTuples = Math.max(...samples.map((s) => s.deadTuples));
  const peakToastDeadTuples = Math.max(...samples.map((s) => s.toastDeadTuples));
  const finalTableSize = samples[samples.length - 1]?.tableSize || finalSize;
  const finalToastTableSize = samples[samples.length - 1]?.toastTableSize || finalToastSize;

  console.log(`\n  Summary:`);
  console.log(`    Total updates: ${formatNumber(updateCount)}`);
  console.log(`    Updates per second: ${(updateCount / durationSeconds).toFixed(2)}`);
  console.log(`\n  Main Table:`);
  console.log(`    Peak dead tuples: ${formatNumber(peakDeadTuples)}`);
  console.log(`    Final dead tuples: ${formatNumber(finalStats.n_dead_tup)}`);
  console.log(`    Autovacuum runs: ${finalStats.autovacuum_count}`);
  console.log(`    Final size: ${formatBytes(finalTableSize)}`);
  console.log(`\n  TOAST Table:`);
  console.log(`    Peak dead tuples: ${formatNumber(peakToastDeadTuples)}`);
  console.log(`    Final dead tuples: ${formatNumber(finalToastStats?.n_dead_tup || 0)}`);
  console.log(`    Autovacuum runs: ${finalToastStats?.autovacuum_count || 0}`);
  console.log(`    Final size: ${formatBytes(finalToastTableSize)}`);

  // Get detailed TOAST bloat analysis
  console.log(`\n  TOAST Bloat Analysis (pgstattuple):`);
  const toastTableForBloat = await getToastTableName(tableName);
  console.log(`    TOAST table name: ${toastTableForBloat || 'not found'}`);

  try {
    const toastBloat = await getToastBloat(tableName);
    if (toastBloat) {
      const totalSpace = toastBloat.table_len;
      const usedSpace = toastBloat.tuple_len;
      const wastedSpace = toastBloat.dead_tuple_len + toastBloat.free_space;
      const bloatPercent = (wastedSpace / totalSpace) * 100;

      console.log(`    Total table size: ${formatBytes(totalSpace)}`);
      console.log(`    Live data: ${formatBytes(usedSpace)} (${toastBloat.tuple_percent.toFixed(2)}%)`);
      console.log(`    Dead tuples: ${formatBytes(toastBloat.dead_tuple_len)} (${toastBloat.dead_tuple_percent.toFixed(2)}%)`);
      console.log(`    Free space: ${formatBytes(toastBloat.free_space)} (${toastBloat.free_percent.toFixed(2)}%)`);
      console.log(`    Total wasted: ${formatBytes(wastedSpace)} (${bloatPercent.toFixed(2)}%)`);
      console.log(`    Bloat amplification: ${(totalSpace / usedSpace).toFixed(1)}x`);
    } else {
      console.log(`    Unable to get TOAST bloat stats (check errors above)`);
    }
  } catch (error) {
    console.log(`    Error getting TOAST bloat: ${error}`);
  }

  // Test VACUUM FULL to see how much space can be reclaimed
  console.log(`\n  Testing VACUUM FULL effectiveness:`);
  const sizeBeforeVacuumFull = await getTableSize(tableName);
  console.log(`    Size before VACUUM FULL: ${formatBytes(sizeBeforeVacuumFull)}`);
  await sql.unsafe(`VACUUM FULL ${tableName}`);
  const sizeAfterVacuumFull = await getTableSize(tableName);
  console.log(`    Size after VACUUM FULL: ${formatBytes(sizeAfterVacuumFull)}`);
  const reclaimed = sizeBeforeVacuumFull - sizeAfterVacuumFull;
  console.log(`    Space reclaimed: ${formatBytes(reclaimed)} (${((reclaimed / sizeBeforeVacuumFull) * 100).toFixed(2)}%)`);
  console.log(`    Conclusion: ${reclaimed > 1024 * 1024 ? 'Significant bloat present despite autovacuum' : 'Autovacuum working effectively'}`);

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
