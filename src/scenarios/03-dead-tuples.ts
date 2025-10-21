import { sql, resetTable, disableAutovacuum } from "../database";
import { generateLargeJsonb, getUpdateTimestampQuery } from "../fixtures";
import { getTableStats, getTableSize, calculateBloatRatio, formatNumber, formatBytes } from "../metrics";

export async function run() {
  console.log("\n=== Scenario 3: Dead Tuple Accumulation ===\n");

  const tableName = "dead_tuple_test";
  await resetTable(tableName);
  await disableAutovacuum(tableName);
  await sql.unsafe(`UPDATE ${tableName} SET data = '${JSON.stringify(generateLargeJsonb())}'::jsonb WHERE id = 1`);

  const iterations = 10000;

  const statsBefore = await getTableStats(tableName);
  const sizeBefore = await getTableSize(tableName);

  console.log("  Performing 10,000 updates with autovacuum disabled...");

  for (let i = 0; i < iterations; i++) {
    await sql.unsafe(getUpdateTimestampQuery(tableName));

    if ((i + 1) % 2000 === 0) {
      const currentStats = await getTableStats(tableName);
      console.log(`    ${i + 1} updates: ${formatNumber(currentStats.n_dead_tup)} dead tuples`);
    }
  }

  const statsAfter = await getTableStats(tableName);
  const sizeAfter = await getTableSize(tableName);

  const deadTuples = statsAfter.n_dead_tup;
  const liveTuples = statsAfter.n_live_tup;
  const bloatRatio = calculateBloatRatio(statsAfter);
  const tableGrowth = sizeAfter - sizeBefore;

  console.log(`\n  Final statistics:`);
  console.log(`    Live tuples: ${formatNumber(liveTuples)}`);
  console.log(`    Dead tuples: ${formatNumber(deadTuples)}`);
  console.log(`    Bloat ratio: ${bloatRatio.toFixed(2)}:1 (${formatNumber(deadTuples)} dead / ${formatNumber(liveTuples)} live)`);
  console.log(`    Table growth: ${formatBytes(tableGrowth)}`);
  console.log(`    Total table size: ${formatBytes(sizeAfter)}`);

  await sql`DROP TABLE IF EXISTS ${sql(tableName)}`;

  return {
    iterations,
    liveTuples,
    deadTuples,
    bloatRatio,
    tableGrowth,
    finalTableSize: sizeAfter,
  };
}
