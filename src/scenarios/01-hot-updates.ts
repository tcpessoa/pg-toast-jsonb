import { sql, resetTable } from "../database";
import { generateSmallJsonb, generateLargeJsonb, getUpdateTimestampQuery } from "../fixtures";
import { getTableStats, calculateHotRatio, formatNumber } from "../metrics";

export async function run() {
  console.log("\n=== Scenario 1: HOT Updates Prevention ===\n");

  const iterations = 10000;

  // Test 1: Small JSONB (should allow HOT updates)
  console.log("Testing small JSONB (~100 bytes)...");
  const smallTable = "hot_test_small";
  await resetTable(smallTable);
  const smallData = JSON.stringify(generateSmallJsonb());
  await sql.unsafe(`UPDATE ${smallTable} SET data = '${smallData}'::jsonb WHERE id = 1`);

  const statsBefore1 = await getTableStats(smallTable);

  for (let i = 0; i < iterations; i++) {
    await sql.unsafe(getUpdateTimestampQuery(smallTable));
  }

  const statsAfter1 = await getTableStats(smallTable);
  const hotRatioSmall = calculateHotRatio(statsAfter1);

  console.log(`  Total updates: ${formatNumber(statsAfter1.n_tup_upd - statsBefore1.n_tup_upd)}`);
  console.log(`  HOT updates: ${formatNumber(statsAfter1.n_tup_hot_upd - statsBefore1.n_tup_hot_upd)}`);
  console.log(`  HOT ratio: ${(hotRatioSmall * 100).toFixed(2)}%`);

  // Test 2: Large JSONB (should prevent HOT updates)
  console.log("\nTesting large JSONB (~50KB)...");
  const largeTable = "hot_test_large";
  await resetTable(largeTable);
  await sql.unsafe(`UPDATE ${largeTable} SET data = '${JSON.stringify(generateLargeJsonb())}'::jsonb WHERE id = 1`);

  const statsBefore2 = await getTableStats(largeTable);

  for (let i = 0; i < iterations; i++) {
    await sql.unsafe(getUpdateTimestampQuery(largeTable));
  }

  const statsAfter2 = await getTableStats(largeTable);
  const hotRatioLarge = calculateHotRatio(statsAfter2);

  console.log(`  Total updates: ${formatNumber(statsAfter2.n_tup_upd - statsBefore2.n_tup_upd)}`);
  console.log(`  HOT updates: ${formatNumber(statsAfter2.n_tup_hot_upd - statsBefore2.n_tup_hot_upd)}`);
  console.log(`  HOT ratio: ${(hotRatioLarge * 100).toFixed(2)}%`);

  // Cleanup
  await sql`DROP TABLE IF EXISTS ${sql(smallTable)}`;
  await sql`DROP TABLE IF EXISTS ${sql(largeTable)}`;

  return {
    small: {
      totalUpdates: statsAfter1.n_tup_upd - statsBefore1.n_tup_upd,
      hotUpdates: statsAfter1.n_tup_hot_upd - statsBefore1.n_tup_hot_upd,
      hotRatio: hotRatioSmall,
    },
    large: {
      totalUpdates: statsAfter2.n_tup_upd - statsBefore2.n_tup_upd,
      hotUpdates: statsAfter2.n_tup_hot_upd - statsBefore2.n_tup_hot_upd,
      hotRatio: hotRatioLarge,
    },
  };
}
