# PostgreSQL JSONB Update Performance Test Results

## Executive Summary

Tests demonstrate significant performance degradation and storage bloat when updating large JSONB documents (>50KB) in PostgreSQL, even when only modifying small fields.

## Key Findings

### ✅ TOAST Write Amplification (Scenario 2)
- **Result**: Updating a 25-byte timestamp field causes 80.96 KB TOAST writes
- **Write Amplification**: 3,316x
- **Implication**: Entire JSONB document is rewritten on any field update

### ✅ Update Throughput Impact (Scenario 5)
- **Small JSONB** (~100 bytes): 3,256 updates/sec
- **Large JSONB** (~50KB): 316 updates/sec
- **Performance Penalty**: 10.3x slower for large documents
- **Latency Impact**: 10.3x higher (0.31ms vs 3.16ms)

### ⚠️ Autovacuum Struggles with High-Frequency Updates (Scenario 4)
- **Workload**: 310 updates/sec over 60 seconds
- **Autovacuum Runs**: Only 1 trigger in 60 seconds
- **Table Bloat**: 1.05 GB for a single-row table
- **Dead Tuples**: Peak of 169, ending at 170
- **Conclusion**: Autovacuum cannot keep pace with aggressive update patterns

### ⚠️ Dead Tuple Accumulation with Autovacuum Disabled (Scenario 3)
- **Expected**: ~10,000 dead tuples after 10,000 updates
- **Actual**: Only 118 dead tuples reported
- **Table Growth**: 790 MB (significant bloat still occurred)
- **Issue**: Possible autovacuum interference despite configuration

### ❌ HOT Updates Still Occurring (Scenario 1)
- **Expected**: Large JSONB (>2KB) should prevent HOT updates (0% HOT ratio)
- **Actual**: 100% HOT ratio for both small and large JSONB
- **Issue**: Test may be invalid without indexes on the table

---

## Issues to Investigate

### 1. Why Are HOT Updates Occurring for Large JSONB?

**Current Result**: 100% HOT update ratio for 50KB JSONB documents

**Possible Explanations**:

1. **Missing Indexes**: HOT optimization specifically avoids updating indexes. Without indexes, there's no performance difference to measure. The test table likely has no indexes, making HOT vs non-HOT irrelevant.

2. **TOAST Pointer Stability**: PostgreSQL may be storing a TOAST pointer in the main heap tuple. If the pointer itself doesn't change (same TOAST OID), the main tuple might remain small enough for HOT updates even though the TOAST data itself is rewritten.

3. **Page Free Space**: The heap page might have sufficient free space to accommodate new tuple versions with their TOAST pointers, allowing HOT updates to succeed.

**Investigation Steps**:
```sql
-- Check if table has indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'your_test_table';

-- Check table structure
\d+ your_test_table

-- Verify TOAST usage
SELECT
    pg_column_size(data) as column_size,
    pg_total_relation_size('your_test_table') as total_size,
    pg_relation_size('your_test_table') as heap_size,
    pg_total_relation_size('your_test_table') - pg_relation_size('your_test_table') as toast_size
FROM your_test_table;
```

**Fix**: Add an index to the test table (e.g., `CREATE INDEX idx_id ON test_table(id);`) to make HOT update testing meaningful. HOT updates are only beneficial when they avoid index maintenance.

---

### 2. Why Only 118 Dead Tuples Instead of ~10,000?

**Current Result**: After 10,000 updates with "autovacuum disabled", only 118 dead tuples are reported

**Possible Explanations**:

1. **Autovacuum Not Fully Disabled**: Setting `autovacuum_enabled = false` at the session level might not be sufficient. Background autovacuum launcher might still be running.

2. **Manual VACUUM Interference**: Another process or monitoring tool might be running VACUUM commands.

3. **Tuple Visibility vs Dead Tuples**: PostgreSQL might be reusing tuple slots on the same page during updates, making some "dead" tuples invisible to `pg_stat_user_tables` counters.

4. **Statistics Lag**: The `pg_stat_user_tables` view might not update immediately, showing stale dead tuple counts.

**Investigation Steps**:
```sql
-- Verify autovacuum is disabled at table level
ALTER TABLE test_table SET (autovacuum_enabled = false);

-- Check autovacuum status
SHOW autovacuum;

-- Monitor for any VACUUM activity during test
SELECT
    schemaname,
    relname,
    last_vacuum,
    last_autovacuum,
    autovacuum_count
FROM pg_stat_user_tables
WHERE relname = 'your_test_table';

-- Check for dead tuples using pgstattuple extension
CREATE EXTENSION IF NOT EXISTS pgstattuple;
SELECT * FROM pgstattuple('your_test_table');
```

**Fix**:
- Disable autovacuum at both database and table level
- Use `pgstattuple` extension for accurate dead tuple counting
- Add logging to detect any VACUUM operations during the test
- Consider setting `autovacuum = off` in postgresql.conf and restarting PostgreSQL for complete isolation

---

### 3. Table Bloat Despite Low Dead Tuple Count

**Observation**: Scenario 3 shows 790 MB table growth despite only 118 dead tuples

**Question**: If dead tuples are being cleaned up, why is the table still bloating?

**Possible Explanations**:

1. **TOAST Table Bloat**: Dead tuples might be in the TOAST table, not the main heap table. `pg_stat_user_tables` only shows main table statistics.

2. **Free Space Map**: Even if tuples are vacuumed, PostgreSQL might not be truncating the table files. The space becomes "free" but still allocated.

3. **Page Fragmentation**: Frequent updates cause page-level fragmentation. Even with VACUUM, pages might not be fully packed, leaving unusable gaps.

**Investigation Steps**:
```sql
-- Check TOAST table statistics separately
SELECT
    n_live_tup,
    n_dead_tup,
    schemaname,
    relname
FROM pg_stat_user_tables
WHERE relname LIKE 'pg_toast%';

-- Check table bloat with pgstattuple
SELECT
    free_percent,
    dead_tuple_percent,
    avg_leaf_density
FROM pgstattuple('your_test_table');

-- Try VACUUM FULL to see if it reclaims space
VACUUM FULL your_test_table;
SELECT pg_size_pretty(pg_total_relation_size('your_test_table'));
```

**Expected Finding**: Most bloat is likely in the TOAST table, not the main heap table.

---

## Recommended Test Improvements

1. **Add indexes** to test tables for meaningful HOT update testing
2. **Use `pgstattuple` extension** for accurate dead tuple measurements
3. **Disable autovacuum completely** via postgresql.conf for Scenario 3
4. **Monitor TOAST table statistics** separately in all scenarios
5. **Add pre-test validation** to verify configuration (indexes exist, autovacuum status, etc.)
