import { Client } from 'pg';
import Chance from 'chance';
import fs from 'fs';

const chance = new Chance();
const client = new Client({
  host: 'localhost',
  port: 5435,
  database: 'jsonb_test',
  user: 'testuser',
  password: 'testpass',
});

async function dropTablesIfExist() {
  await client.query('DROP TABLE IF EXISTS test_jsonb_large');
  await client.query('DROP TABLE IF EXISTS test_jsonb_small');
}

async function createTables() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS test_jsonb_large (
      id SERIAL PRIMARY KEY,
      data JSONB
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS test_jsonb_small (
      id SERIAL PRIMARY KEY,
      data JSONB
    )
  `);
}

async function insertData() {
  const largeData = {
    users: Array.from({ length: 1000 }, () => ({
      id: chance.guid(),
      name: chance.name(),
      email: chance.email(),
      address: chance.address(),
      phone: chance.phone(),
    })),
    updatedAt: new Date().toISOString(),
  };

  const smallData = {
    id: chance.guid(),
    name: chance.name(),
    updatedAt: new Date().toISOString(),
  };

  await client.query('INSERT INTO test_jsonb_large (data) VALUES ($1)', [largeData]);
  await client.query('INSERT INTO test_jsonb_small (data) VALUES ($1)', [smallData]);
}

async function updateLargeJsonb() {
  const result = await client.query('SELECT id FROM test_jsonb_large LIMIT 1');
  if (result.rows.length > 0) {
    const id = result.rows[0].id;
    const updatedAt = new Date().toISOString();

    await client.query(`
      UPDATE test_jsonb_large 
      SET data = jsonb_set(data, '{updatedAt}', to_jsonb($1::text), true) 
      WHERE id = $2
    `, [updatedAt, id]);
  }
}

async function updateSmallJsonb() {
  const result = await client.query('SELECT id FROM test_jsonb_small LIMIT 1');
  if (result.rows.length > 0) {
    const id = result.rows[0].id;
    const updatedAt = new Date().toISOString();

    await client.query(`
      UPDATE test_jsonb_small 
      SET data = jsonb_set(data, '{updatedAt}', to_jsonb($1::text), true) 
      WHERE id = $2
    `, [updatedAt, id]);
  }
}

async function getTableSizes() {
  const largeSizeResult = await client.query(`
    SELECT 
      pg_total_relation_size('test_jsonb_large') as total_size,
      pg_relation_size('test_jsonb_large') as main_size,
      pg_total_relation_size('test_jsonb_large') - pg_relation_size('test_jsonb_large') as toast_size
  `);

  const smallSizeResult = await client.query(`
    SELECT 
      pg_total_relation_size('test_jsonb_small') as total_size,
      pg_relation_size('test_jsonb_small') as main_size,
      pg_total_relation_size('test_jsonb_small') - pg_relation_size('test_jsonb_small') as toast_size
  `);

  return {
    large: largeSizeResult.rows[0],
    small: smallSizeResult.rows[0]
  };
}

interface TableSizes {
  total_size: number;
  main_size: number;
  toast_size: number;
}

interface SizeEntry {
  updateCount: number;
  large: TableSizes;
  small: TableSizes;
}

async function runTest(updateFn: () => Promise<void>, description: string) {
  const TEST_DURATION = 60000; // 1 minute
  console.log('TEST_DURATION:', TEST_DURATION);
  console.log(`Starting test: ${description}`);
  const sizes: SizeEntry[] = [];
  const initialSizes = await getTableSizes();
  console.log('Initial sizes:', initialSizes);
  sizes.push({ updateCount: 0, ...initialSizes });

  let updateCount = 0;
  const startTime = Date.now();

  while (Date.now() - startTime < TEST_DURATION) {
    await updateFn();
    updateCount++;

    if (updateCount % 1000 === 0) {
      const currentSizes = await getTableSizes();
      console.log(`After ${updateCount} updates:`, currentSizes);
      sizes.push({ updateCount, ...currentSizes });
    }
  }

  const finalSizes = await getTableSizes();
  console.log(`Final sizes after ${updateCount} updates:`, finalSizes);
  sizes.push({ updateCount, ...finalSizes });

  return { description, sizes };
}

async function main() {
  await client.connect();
  
  await dropTablesIfExist();
  await createTables();
  await insertData();

  const largeResults = await runTest(updateLargeJsonb, "Large JSONB updates");
  const smallResults = await runTest(updateSmallJsonb, "Small JSONB updates");

  const results = {
    largeUpdates: largeResults,
    smallUpdates: smallResults
  };

  let htmlTemplate = fs.readFileSync('visualization_template.html', 'utf-8');

  const htmlContent = htmlTemplate.replace('{{DATA_PLACEHOLDER}}', JSON.stringify(results));

  fs.writeFileSync('jsonb_update_results.html', htmlContent);

  console.log('Results have been written to jsonb_update_results.html');

  await client.end();
}

main().catch(console.error);
