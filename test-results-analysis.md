# PostgreSQL JSONB Update Performance Test Results

## Executive Summary

Tests demonstrate significant performance degradation and storage bloat when updating large JSONB documents (>50KB) in PostgreSQL, even when only modifying small fields.

## Key Findings

### TOAST Write Amplification (Scenario 1)
- **Result**: Updating a 25-byte timestamp field causes 80.96 KB TOAST writes
- **Write Amplification**: 3,316x
- **Implication**: Entire JSONB document is rewritten on any field update

### Autovacuum Fundamentally Ineffective for TOAST-Heavy Workloads (Scenario 2)

**Workload**: ~100 updates/sec over 60 seconds (~6,000 total updates) on a single-row table with ~80KB JSONB

**Bloat Results**:
- **Final table size**: 1.87 GB
- **Live data**: 354 KB (0.02%)
- **Dead TOAST chunks**: 1.44 GB (77%)
- **Free space**: 426 MB (23%)
- **Bloat amplification**: 5,400x (1.87 GB / 354 KB)
- **After VACUUM FULL**: 400 KB (99.98% space reclaimed)
- **Autovacuum runs**: 1 trigger at ~15 seconds

**Critical Finding**: `pgstattuple` reveals that **77% of the TOAST table is dead tuples**, invisible to `pg_stat_user_tables`. Despite autovacuum running once, it **failed to prevent catastrophic bloat accumulation**.

**Why Autovacuum Failed**:

1. **TOAST bloat is invisible to autovacuum triggers**
   - Main table dead tuples: 0-143 (below aggressive trigger thresholds)
   - TOAST table dead tuples: 0 (orphaned chunks don't register as "dead tuples")
   - Autovacuum triggers based on row-level stats, not data volume

2. **Single autovacuum run was insufficient**
   - First run at ~15s when table was already 572 MB
   - Bloat continued growing: 572 MB → 1.87 GB despite autovacuum having run
   - Regular VACUUM marked space as free but couldn't shrink the file
   - Free space (23% of table) wasn't efficiently reused due to TOAST chunk append behavior

3. **Default thresholds ignore TOAST-heavy workloads**
   - For a 1-row table: `autovacuum_vacuum_threshold (50) + autovacuum_vacuum_scale_factor (0.2) * 1 = 50` dead tuples needed
   - With ~100 updates creating ~100 dead tuples per 5s window, threshold barely triggers
   - Meanwhile, each update writes 80 KB to TOAST, accumulating GB-scale bloat

**Conclusion**: **Autovacuum's design is fundamentally incompatible with high-frequency updates to large JSONB documents.** The triggering mechanism cannot detect TOAST bloat, and even when triggered, regular VACUUM cannot reclaim the wasted space without `VACUUM FULL` (which locks tables).

### Update Throughput Impact (Scenario 3)
- **Small JSONB** (~100 bytes): 3,256 updates/sec
- **Large JSONB** (~50KB): 316 updates/sec
- **Performance Penalty**: 10.3x slower for large documents
- **Latency Impact**: 10.3x higher (0.31ms vs 3.16ms)

---

## Root Cause Analysis

### The TOAST Bloat Problem

PostgreSQL's autovacuum system has a **critical blind spot** for TOAST-stored data:

1. **How TOAST updates work**:
   - Each JSONB update rewrites the entire document to new TOAST chunks
   - Old TOAST chunks become orphaned but aren't tracked as "dead tuples" by `pg_stat_user_tables`
   - Main table shows only 1 dead row per update, masking the 80 KB of TOAST bloat

2. **Why standard monitoring fails**:
   - `pg_stat_user_tables.n_dead_tup` = 0 for TOAST tables (despite 1.44 GB of dead tuples!)
   - `pgstattuple` reveals the truth: 77% dead tuples + 23% free space = 99.5% bloat
   - Autovacuum thresholds based on tuple count, not storage volume
   - No visibility into TOAST bloat without running `pgstattuple` or `VACUUM FULL`

3. **VACUUM vs VACUUM FULL - The Critical Difference**:
   - **Regular VACUUM** (what autovacuum runs):
     - Marks dead tuples as "free space" available for reuse
     - Does NOT shrink files or return disk space to OS
     - Only truncates empty pages at the file's end
     - Free space can be reused IF new data fits in freed pages
   - **VACUUM FULL**:
     - Completely rewrites the table, packing all live data
     - Returns all freed space to the OS
     - Requires exclusive table lock (blocks all operations)
   - **Why regular VACUUM failed in this test**:
     - Autovacuum ran and marked 1.44 GB as "free space"
     - But with a single-row workload, PostgreSQL kept appending new TOAST chunks to the end
     - Free space in the middle couldn't be reused efficiently
     - Result: 77% dead tuples + 23% fragmented free space = 99.5% bloat
     - Only `VACUUM FULL` could reclaim this by rewriting the entire table

### Implications for Production Systems

For applications with:
- Large JSONB documents (>2 KB, forcing TOAST storage)
- Frequent partial updates (e.g., updating metadata fields)
- Low row counts (1-1000s of rows)

**Default autovacuum configuration will cause runaway storage bloat**, accumulating at ~31 MB/second in our test (1.87 GB / 60s), with a bloat amplification of **5,400x** (table is 5,400 times larger than actual data).

---

## Mitigation Strategies

### 1. Aggressive Autovacuum Tuning (Partial Solution)
```sql
ALTER TABLE your_table SET (
  autovacuum_vacuum_threshold = 10,
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_vacuum_cost_delay = 2
);
```
- Forces more frequent autovacuum runs
- Still won't prevent bloat, only reduces accumulation rate
- Increases I/O overhead

### 2. Scheduled VACUUM FULL (High Cost)
**Why needed**: Regular VACUUM cannot reclaim bloat in single-row, high-update workloads

**Trade-offs**:
Pros:
- Reclaims all wasted space (99.98% in our test)
Cons:
- Requires exclusive table lock (blocks all reads/writes)
- Rewrites entire table (expensive I/O operation)
- Only viable during maintenance windows for production systems

**Example**:
```sql
-- Check bloat first
SELECT pg_size_pretty(pg_total_relation_size('your_table')) as current_size;

-- Reclaim space (blocks table!)
VACUUM FULL your_table;

SELECT pg_size_pretty(pg_total_relation_size('your_table')) as new_size;
```

### 3. Schema Redesign (Recommended)
- **Split large JSONB into separate columns** for frequently-updated fields
- **Use separate tables** for high-churn data vs stable data
- **Denormalize hot fields** out of JSONB to avoid TOAST rewrites

### 4. Monitor TOAST Bloat Proactively
```sql
-- Use pgstattuple to check real bloat
CREATE EXTENSION IF NOT EXISTS pgstattuple;

SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  round(dead_tuple_percent, 2) as dead_pct,
  round(free_percent, 2) as free_pct
FROM pg_stat_user_tables t
JOIN LATERAL pgstattuple(t.schemaname||'.'||tablename) ON true
WHERE tablename LIKE '%toast%';
```

---

## Conclusion

1. ✅ **Avoid storing frequently-updated fields in large JSONB documents**
2. ✅ **Monitor TOAST table sizes**, not just dead tuple counts
3. ✅ **Use `pgstattuple` for real bloat visibility**
4. ⚠️ **Consider table partitioning** for time-series JSONB data (drop old partitions vs VACUUM)
5. ⚠️ **Benchmark JSONB vs normalized schemas** for your specific workload
