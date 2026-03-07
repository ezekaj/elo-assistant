# Bugs & Errors - 2026-03-07

## Test Failures (195 tests failing)

### 1. Session-Memory Filter Bug #2681 ⚠️ **OPEN**

**Test**: `session-memory/handler.test.ts:247`
**Name**: "filters messages before slicing (fix for #2681)"

**What it tests**:
- Hook should filter tool entries FIRST
- THEN slice to get last N messages
- Currently does it backwards (slice then filter)

**Failure**:
```
Expected: "First message" to be filtered out
Actual: "First message" still appears in memory
```

**Impact**: 
- Session memory includes tool noise
- Gets fewer messages than requested
- Memory bloat with tool entries

**Status**: ⚠️ OPEN - Bug in session-memory hook handler

---

### 2. Heartbeat-V2 Database Init ⚠️ **TEST ISSUE**

**Error**: "Database not initialized"
**Test**: `heartbeat-v2/scheduler.test.ts`

**Root cause**: 
- Tests don't properly initialize DB before calling `getSchedule()`
- Unhandled rejection in test cleanup

**Impact**: Test-only, production code works fine

**Status**: ⚠️ TEST BUG - Needs better test setup/teardown

---

### 3. Retry-Policy Test Error ℹ️ **FALSE POSITIVE**

**Error**: "boom" (intentional test error)
**Test**: `retry-policy.test.ts:17`

**Root cause**: 
- Test intentionally throws "boom" to test retry logic
- Vitest reports as unhandled rejection
- Actually expected behavior

**Status**: ℹ️ FALSE POSITIVE - Test works as designed

---

## Runtime Errors

### 4. Neuro-Memory Store Errors ⚠️ **RECURRING**

**Error**: "Neuro-memory store error:" (repeated in logs)
**Frequency**: Every 10-30 seconds

**Log entries**:
```
[DEBUG] event-mesh: Neuro-memory store error:
```

**Impact**: 
- Memory consolidation may be failing
- Pattern learning could be broken
- Predictive engine losing training data

**Status**: ⚠️ OPEN - Need full error message

---

### 5. read Tool Warning ℹ️ **USER ERROR**

**Warning**: "read tool called without path"
**Log entry**:
```
[WARN] read tool called without path: toolCallId=call_d331a96476ff4e9983ac6572
```

**Cause**: Agent tried to read file with offset beyond EOF

**Impact**: None - graceful failure

**Status**: ℹ️ USER ERROR - Not a bug

---

## Previously Fixed (2026-03-03)

| Bug | Status | Fix |
|-----|--------|-----|
| Predictive engine 0 patterns | ✅ FIXED | Manual seed |
| grep/glob `signal` option | ✅ FIXED | Changed to `cancelSignal` |
| HTTP API 500 errors | ℹ️ DOCS | By design |

---

## Summary

| Bug | Severity | Status | Impact |
|-----|----------|--------|--------|
| Session-memory filter | Medium | ⚠️ OPEN | Memory bloat |
| Neuro-memory store | High | ⚠️ OPEN | Learning broken |
| Heartbeat DB init | Low | ⚠️ TEST | Tests only |
| Retry "boom" | None | ℹ️ FALSE | Expected |

**Priority fixes needed**:
1. **Neuro-memory store errors** (blocking learning)
2. **Session-memory filter** (memory bloat)
3. **Test cleanup** (heartbeat-v2)

---

*Audited: 2026-03-07 17:10 GMT+1*
