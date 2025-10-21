import { sql, resetTable } from "../database";
import { generateSmallJsonb, generateLargeJsonb, getUpdateTimestampQuery } from "../fixtures";
import { formatNumber } from "../metrics";

export async function run() {
  console.log("\n=== Scenario 5: Update Throughput Comparison ===\n");

  const durationSeconds = 60;

  // Test 1: Small JSONB throughput
  console.log("Testing small JSONB (~100 bytes)...");
  const smallTable = "throughput_small";
  await resetTable(smallTable);
  await sql.unsafe(`UPDATE ${smallTable} SET data = '${JSON.stringify(generateSmallJsonb())}'::jsonb WHERE id = 1`);

  let smallCount = 0;
  const smallStart = Date.now();
  const smallLatencies: number[] = [];

  while (Date.now() - smallStart < durationSeconds * 1000) {
    const updateStart = Date.now();
    await sql.unsafe(getUpdateTimestampQuery(smallTable));
    const updateEnd = Date.now();
    smallLatencies.push(updateEnd - updateStart);
    smallCount++;
  }

  const smallDuration = (Date.now() - smallStart) / 1000;
  const smallThroughput = smallCount / smallDuration;
  const smallAvgLatency = smallLatencies.reduce((a, b) => a + b, 0) / smallLatencies.length;

  console.log(`  Updates completed: ${formatNumber(smallCount)}`);
  console.log(`  Duration: ${smallDuration.toFixed(2)}s`);
  console.log(`  Throughput: ${smallThroughput.toFixed(2)} updates/sec`);
  console.log(`  Avg latency: ${smallAvgLatency.toFixed(2)}ms`);

  // Test 2: Large JSONB throughput
  console.log("\nTesting large JSONB (~50KB)...");
  const largeTable = "throughput_large";
  await resetTable(largeTable);
  await sql.unsafe(`UPDATE ${largeTable} SET data = '${JSON.stringify(generateLargeJsonb())}'::jsonb WHERE id = 1`);

  let largeCount = 0;
  const largeStart = Date.now();
  const largeLatencies: number[] = [];

  while (Date.now() - largeStart < durationSeconds * 1000) {
    const updateStart = Date.now();
    await sql.unsafe(getUpdateTimestampQuery(largeTable));
    const updateEnd = Date.now();
    largeLatencies.push(updateEnd - updateStart);
    largeCount++;
  }

  const largeDuration = (Date.now() - largeStart) / 1000;
  const largeThroughput = largeCount / largeDuration;
  const largeAvgLatency = largeLatencies.reduce((a, b) => a + b, 0) / largeLatencies.length;

  console.log(`  Updates completed: ${formatNumber(largeCount)}`);
  console.log(`  Duration: ${largeDuration.toFixed(2)}s`);
  console.log(`  Throughput: ${largeThroughput.toFixed(2)} updates/sec`);
  console.log(`  Avg latency: ${largeAvgLatency.toFixed(2)}ms`);

  const throughputRatio = smallThroughput / largeThroughput;
  const latencyRatio = largeAvgLatency / smallAvgLatency;

  console.log(`\n  Comparison:`);
  console.log(`    Small JSONB is ${throughputRatio.toFixed(2)}x faster`);
  console.log(`    Large JSONB has ${latencyRatio.toFixed(2)}x higher latency`);

  await sql`DROP TABLE IF EXISTS ${sql(smallTable)}`;
  await sql`DROP TABLE IF EXISTS ${sql(largeTable)}`;

  return {
    small: {
      updates: smallCount,
      duration: smallDuration,
      throughput: smallThroughput,
      avgLatency: smallAvgLatency,
    },
    large: {
      updates: largeCount,
      duration: largeDuration,
      throughput: largeThroughput,
      avgLatency: largeAvgLatency,
    },
    throughputRatio,
    latencyRatio,
  };
}
