# PostgreSQL JSONB Update Performance Test Scenarios

## Scenario 1: HOT Updates Prevention

**Goal**: Prove that large JSONB (>2KB) prevents Heap-Only Tuple (HOT) updates.

**Why it matters**: HOT updates are PostgreSQL's optimization for updates that don't change indexed columns. They reuse the same page slot, avoiding index updates and reducing bloat. When TOAST is involved, new tuples often can't fit in the same page, breaking HOT eligibility.

**Measurements**:
- `n_tup_hot_upd`: Count of HOT updates (should be 0 for large JSONB)
- `n_tup_upd`: Total update count
- **HOT ratio**: `n_tup_hot_upd / n_tup_upd` (should be high for small JSONB, low/zero for large)

**Test**: Update same row 10,000 times for both small (<2KB) and large (>2KB) JSONB.

---

## Scenario 2: TOAST Write Amplification

**Goal**: Show that updating a single field in large JSONB rewrites the entire TOAST chunk.

**Why it matters**: Even changing one timestamp in a 100KB JSONB document causes the entire document to be re-serialized and written to TOAST, creating write amplification.

**Measurements**:
- TOAST table size growth per update
- Bytes written vs bytes actually changed (e.g., 8 bytes for timestamp vs 100KB TOAST size)
- **Amplification factor**: `toast_growth / actual_data_changed`

**Test**: Update single field repeatedly, track TOAST table size after each batch.

---

## Scenario 3: Dead Tuple Accumulation

**Goal**: Demonstrate how quickly dead tuples accumulate between autovacuum runs.

**Why it matters**: Each update creates a new row version, leaving the old version as a "dead tuple". These pile up until VACUUM reclaims them, causing table bloat.

**Measurements**:
- `n_dead_tup`: Count of dead row versions
- `n_live_tup`: Count of live rows (should stay at 1)
- Table size growth
- **Bloat ratio**: `n_dead_tup / n_live_tup`

**Test**: Disable autovacuum, perform 10,000 updates, track dead tuples.

---

## Scenario 4: Autovacuum Effectiveness

**Goal**: Check if autovacuum keeps pace with aggressive update workloads.

**Why it matters**: Autovacuum runs periodically based on thresholds. With very frequent updates, bloat can still occur if dead tuples accumulate faster than autovacuum can clean them.

**Measurements**:
- Table size over time (with autovacuum enabled)
- `n_dead_tup` over time
- Autovacuum trigger count from `pg_stat_user_tables.autovacuum_count`
- Peak dead tuples between vacuum runs

**Test**: Run updates for 60 seconds, sample metrics every second, compare with/without autovacuum.

---

## Scenario 5: Update Throughput Comparison

**Goal**: Measure raw performance difference between small and large JSONB updates.

**Why it matters**: Larger documents require more CPU for serialization/deserialization and more I/O for TOAST operations.

**Measurements**:
- Updates per second
- Average update latency (ms)
- Total updates in fixed time period (60s)

**Test**: Continuously update for 60 seconds, count total updates for small vs large JSONB.

---

## Test Data Specs

**Small JSONB** (~100 bytes):
```json
{
  "id": "uuid",
  "name": "string",
  "updatedAt": "timestamp"
}
```

**Large JSONB** (~50KB, well above 2KB TOAST threshold):
```json
{
  "users": [1000 user objects with id, name, email, address, phone],
  "updatedAt": "timestamp"
}
```

**Update operation**: Change only the `updatedAt` field using `jsonb_set()`.
