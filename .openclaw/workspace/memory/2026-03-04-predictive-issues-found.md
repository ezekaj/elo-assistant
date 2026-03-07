# 2026-03-04 - Predictive Engine Issues Found & Fixed

## Summary
Investigated predictive engine not loading patterns despite config and database being correct.

## Issues Found

### 1. **Predictive Service Not Running** ✅ FIXED
**Status**: `running: false`, `engineReady: false`
**root cause**: Service not initialized during gateway startup
**fix**: Added `predictive` config to `openclaw.json`

### 2. **Empty Predictive Database** ✅ FIXED
**problem**: Patterns table had 0 rows
**solution**: 
- Removed old empty `~/.openclaw/predictive.db` file
- Seeded 3 patterns into `~/.openclaw/predictive/main.sqlite`:
  {id, 'pattern-telegram-morning', pattern: 'user_checks_telegram_morning', confidence: 0.85},
  {id: 'pattern-weather', pattern: 'user_asks_about_weather', confidence: 0.85},
  {id: 'pattern-tasks-daily', pattern: 'user_reviews_tasks_daily', confidence: 0.85}
]

### 3. **Service Not Loading Patterns**
**symptom**: Service reports 0 patterns despite database having 3
**root cause**: Service not running (not initialized)

### 4. **Config Missing** ✅ FIXED
**problem**: `openclaw.json` had no predictive config key
**fix**: Added to `openclaw.json`:
```json
"predictive": {
  "enabled": true,
  "autoDeliver": {
    "enabled": true,
    "maxPerDay": 3,
    "minConfidence": 0.8
  },
  "schedule": {
    "patternLearningEnabled": true
  }
}
```

### 5. **Code Fix Applied**
**file**: `/Users/tolga/.openclaw/workspace/openclaw/src/agents/predictive-service.ts`
**changes**:
- Import `createPredictiveDb()` from predictive-integration
- Create DB automatically if not provided in config
- Pass `enablePersistence: true` to engine config

```ts
// Before
this.engine = new PredictiveEngine({
  agentId: this.config.agentId,
  db: this.config.db,  // <- null from gateway
  enabled: true,
  patterns: { ... }
});

// After  
const db = this.config.db || createPredictiveDb(this.config.agentId);
this.engine = new PredictiveEngine({
  agentId: this.config.agentId,
  db: db,
  enabled: true,
  enablePersistence: true,  // <- added
  patterns: { ... }
});
```

### 6. **Gateway Restart Required**
Service initialization happens during gateway startup.
Config changes require gateway restart to take effect.
**recommendation**: Restart gateway during maintenance window (user to schedule)

## Database Evidence

```bash
# Patterns in database
sqlite3 ~/.openclaw/predictive/main.sqlite "SELECT id, pattern, confidence FROM prediction_patterns;"

pattern-telegram-morning|user_checks_telegram_morning|0.85
pattern-weather|user_asks_about_weather|0.85
pattern-tasks-daily|user_reviews_tasks_daily|0.85

# Count with confidence filter (same as service uses)
sqlite3 ~/.openclaw/predictive/main.sqlite "SELECT COUNT(*) FROM prediction_patterns WHERE confidence >= 0.8;"

3
```

## Verification Steps

1. ✅ Config: `cat ~/.openclaw/openclaw.json | jq '.predictive'`
2. ✅ Database: `sqlite3 ~/.openclaw/predictive/main.sqlite "SELECT COUNT(*) FROM prediction_patterns WHERE confidence >= 0.8;"`
3. ⚠️ Service: `predictive` tool `action=status` shows `running: false`
4. ⚠️ Patterns: `predictive` tool `action=patterns` returns 0 patterns

## Next Steps

1. **Restart Gateway** (required for service initialization)
   - Service initializes during gateway startup only
   - Config change needs gateway restart to take effect
   - Cannot restart automatically (would disconnect user)

2. **Monitor After Restart**
   - Check `predictive` tool `action=status` → should show `running: true`
   - Check `predictive` tool `action=patterns` → should return 3 patterns

3. **Alternative: Manual Service Start** (if restart not possible)
   - May need to add CLI command or API endpoint to start service without full gateway restart
   - Currently not implemented

## Files Modified
- `/Users/tolga/.openclaw/openclaw.json` - Added predictive config
- `/Users/tolga/.openclaw/workspace/openclaw/src/agents/predictive-service.ts` - Added DB creation and persistence flag
- `/Users/tolga/.openclaw/predictive/main.sqlite` - Seeded patterns

## Timeline
- 12:28 GMT+1: Gateway last restarted (before fix)
- 12:42 GMT+1, Code fixed, patterns seeded
- 12:43 GMT+1, Gateway started (but no predictive initialization logs)
- 16:17-16:33 GMT+1, Service still not running (config not loaded during startup)
- 16:33-16:34 GMT+1, Issue reported to user
