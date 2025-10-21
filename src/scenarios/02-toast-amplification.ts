import { sql, resetTable, getToastTableName } from "../database";
import { generateLargeJsonb, getUpdateTimestampQuery } from "../fixtures";
import { getToastSize, formatBytes } from "../metrics";

export async function run() {
  console.log("\n=== Scenario 2: TOAST Write Amplification ===\n");

  const tableName = "toast_amplification_test";
  await resetTable(tableName);
  await sql.unsafe(`UPDATE ${tableName} SET data = '${JSON.stringify(generateLargeJsonb())}'::jsonb WHERE id = 1`);

  const toastTableName = await getToastTableName(tableName);

  if (!toastTableName) {
    console.log("  Warning: No TOAST table found. JSONB might be smaller than TOAST threshold.");
    await sql`DROP TABLE IF EXISTS ${sql(tableName)}`;
    return { amplificationFactor: 0, bytesChanged: 0, totalToastGrowth: 0 };
  }

  console.log(`  TOAST table: ${toastTableName}`);

  const updates = 100;
  const toastSizeBefore = await getToastSize(toastTableName);

  for (let i = 0; i < updates; i++) {
    await sql.unsafe(getUpdateTimestampQuery(tableName));
  }

  const toastSizeAfter = await getToastSize(toastTableName);
  const toastGrowth = toastSizeAfter - toastSizeBefore;

  // Estimate: updatedAt is ~25 bytes (ISO timestamp), but entire JSONB is rewritten
  const bytesActuallyChanged = 25; // Approximate timestamp field size
  const amplificationFactor = toastGrowth / (bytesActuallyChanged * updates);

  console.log(`  Updates performed: ${updates}`);
  console.log(`  Bytes actually changed per update: ~${bytesActuallyChanged} bytes`);
  console.log(`  Total TOAST growth: ${formatBytes(toastGrowth)}`);
  console.log(`  Average TOAST growth per update: ${formatBytes(toastGrowth / updates)}`);
  console.log(`  Write amplification factor: ${amplificationFactor.toFixed(2)}x`);

  await sql`DROP TABLE IF EXISTS ${sql(tableName)}`;

  return {
    updates,
    bytesChanged: bytesActuallyChanged,
    totalToastGrowth: toastGrowth,
    avgGrowthPerUpdate: toastGrowth / updates,
    amplificationFactor,
  };
}
