import { closeConnection } from "./database";
import * as scenario1 from "./scenarios/01-toast-amplification";
import * as scenario2 from "./scenarios/02-autovacuum";
import * as scenario3 from "./scenarios/03-throughput";

async function main() {
  console.log("PostgreSQL JSONB Update Performance Test Suite");
  console.log("===============================================\n");

  try {
    await scenario1.run();
    await scenario2.run();
    await scenario3.run();

    console.log("\n\n=== All Tests Complete ===\n");
  } catch (error) {
    console.error("Error running tests:", error);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

main();
