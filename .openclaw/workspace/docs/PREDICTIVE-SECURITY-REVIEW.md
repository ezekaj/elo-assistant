# Predictive Engine Security Review

## Overview

This document outlines security considerations, risks, and mitigations for the Predictive Engine.

**Review Date**: 2026-02-28  
**Version**: 1.0  
**Reviewer**: OpenClaw Team

---

## 🟢 SECURE: Data Storage

### ✅ Local-Only Storage
- **All pattern data stored in local SQLite database**
- **No external transmission of behavior data**
- **No cloud APIs or third-party services**
- **Database file: `~/.openclaw/predictive.db`** (user-controlled)

### ✅ SQLite Security
- Uses parameterized queries (no SQL injection)
- Database file permissions: 0600 (user read/write only)
- No network exposure
- Encrypted at rest (if FileVault enabled)

### ✅ Neuro-Memory Isolation
- Neuro-memory bridge is optional
- If disabled, no semantic storage occurs
- If enabled, still local-only
- Uses same SQLite instance (no additional attack surface)

---

## 🟢 SECURE: Data Collection

### ✅ Minimal Data Collection
**What IS collected:**
- Tool execution metadata (tool name, timestamp)
- Event type and category
- Pattern confidence scores
- Prediction timestamps

**What is NOT collected:**
- Message content (only metadata)
- File contents
- Passwords, tokens, API keys
- Exact GPS coordinates (only context tags)
- Private communication patterns (configurable)

### ✅ Event Data Sanitization
```typescript
// Sensitive fields are automatically stripped
const sanitizedEvent = {
  type: event.type,
  tool: event.tool,
  timestamp: event.timestamp,
  // EXCLUDED: event.data.password, event.data.token, etc.
  data: sanitizeSensitiveFields(event.data),
};
```

### ✅ Configurable Categories
Users can disable sensitive categories:
```json5
categories: {
  communication: false,  // Disable messaging pattern tracking
  email: false,          // Disable email pattern tracking
}
```

---

## 🟡 MODERATE RISK: Pattern Leakage

### Risk
Learned patterns could reveal:
- Daily schedules
- Work habits
- Location patterns
- Communication frequency

### Mitigation
1. **Local-Only**: Data never leaves user's machine
2. **User Control**: Can disable categories, clear history
3. **Access Control**: Database file is user-only (0600)
4. **No Sharing**: No export or sync functionality

### Recommendation
✅ **Acceptable** - User controls their own data locally.

---

## 🟡 MODERATE RISK: Ambient Delivery Spam

### Risk
If compromised, attacker could:
- Trigger excessive notifications
- Spam messaging channels
- Cause notification fatigue

### Mitigation
1. **Rate Limiting**: Max 3 deliveries per day (configurable)
2. **Quiet Hours**: 22:00-08:00 no notifications
3. **Confidence Threshold**: Only high-confidence (0.8+) delivered
4. **User Override**: Can disable auto-delivery

### Recommendation
✅ **Acceptable** - Built-in rate limits prevent abuse.

---

## 🟡 MODERATE RISK: MCP Exposure

### Risk
MCP tool exposes prediction system to external triggers:
- iOS Shortcuts
- IFTTT
- Zapier
- Custom integrations

### Mitigation
1. **Authentication Required**: MCP requires valid token
2. **Action Whitelist**: Only safe actions allowed (check, trigger, feedback)
3. **No Data Exfiltration**: MCP cannot read raw events
4. **Rate Limited**: Inherited MCP rate limits apply
5. **User Control**: Can disable MCP tool entirely

### Recommendation
✅ **Acceptable** - MCP is authenticated and rate-limited.

---

## 🟡 MODERATE RISK: Inference Attacks

### Risk
Sophisticated attacker with database access could:
- Infer user habits from patterns
- Deduce work schedule
- Identify location patterns

### Mitigation
1. **Database Encryption**: Use FileVault (macOS)
2. **Access Control**: Database file 0600 permissions
3. **Pattern Retention**: Only 90 days (configurable)
4. **No Remote Access**: Database not network-accessible

### Recommendation
✅ **Acceptable** - Requires local access to encrypted database.

---

## 🔴 HIGH RISK: None Identified

No high-severity security risks identified.

---

## Security Best Practices

### For Users

1. **Enable FileVault**
   ```bash
   # Check FileVault status
   fdesetup status
   ```

2. **Review Categories**
   ```json5
   // Disable sensitive categories
   categories: {
     communication: false,  // No message patterns
     email: false,          // No email patterns
   }
   ```

3. **Regular Review**
   ```bash
   # Check what patterns are stored
   openclaw predictive patterns
   
   # Clear history if needed
   rm ~/.openclaw/predictive.db
   ```

4. **Strong Gateway Token**
   ```bash
   # Ensure strong token for MCP access
   openclaw gateway config | grep token
   ```

### For Developers

1. **Never Log Sensitive Data**
   ```typescript
   // ✅ Good
   log.info(`Recording event: ${event.type}`);
   
   // ❌ Bad
   log.info(`Event data: ${JSON.stringify(event.data)}`);
   ```

2. **Validate MCP Inputs**
   ```typescript
   if (!["check", "trigger", "feedback"].includes(action)) {
     throw new Error("Invalid action");
   }
   ```

3. **Use Parameterized Queries**
   ```typescript
   // ✅ Good
   db.prepare("SELECT * FROM events WHERE type = ?").run(type);
   
   // ❌ Bad
   db.exec(`SELECT * FROM events WHERE type = '${type}'`);
   ```

4. **Sanitize External Data**
   ```typescript
   const sanitizedContext = sanitizeUserInput(context);
   ```

---

## Threat Model

### Attacker: Remote Adversary
**Capabilities**: Network access, can send requests to gateway  
**Mitigations**:
- Authentication required (gateway token)
- No remote database access
- MCP rate limiting

**Risk Level**: 🟢 LOW

### Attacker: Local User (Unprivileged)
**Capabilities**: Can read user files, run processes  
**Mitigations**:
- Database file 0600 permissions
- FileVault encryption
- No world-readable files

**Risk Level**: 🟢 LOW

### Attacker: Malicious Integration (MCP)
**Capabilities**: Can call MCP tool with valid token  
**Mitigations**:
- Action whitelist (no data exfiltration)
- Rate limiting
- User can disable MCP entirely

**Risk Level**: 🟡 MODERATE

### Attacker: Compromised Application
**Capabilities**: Can read memory, execute code  
**Mitigations**:
- Minimal data in memory
- No sensitive data cached
- Short-lived sessions

**Risk Level**: 🟡 MODERATE

---

## Security Checklist

- [x] Local-only storage (no cloud APIs)
- [x] Parameterized SQL queries
- [x] Database file permissions (0600)
- [x] User-configurable categories
- [x] Rate limiting on deliveries
- [x] Quiet hours enforcement
- [x] MCP authentication required
- [x] Action whitelisting for MCP
- [x] Sensitive field sanitization
- [x] No message content logging
- [x] No password/token storage
- [x] Pattern retention limits (90 days)
- [x] User control over deletion
- [x] No network exposure for database
- [x] Memory data minimized

---

## Penetration Testing Recommendations

### Test Cases

1. **SQL Injection**
   ```bash
   # Try to inject via MCP
   openclaw mcp call predictive trigger \
     --category "'; DROP TABLE events; --"
   ```
   **Expected**: Error, no data loss

2. **MCP Unauthorized Access**
   ```bash
   # Try without token
   curl http://localhost:3000/api/mcp/predictive/check
   ```
   **Expected**: 401 Unauthorized

3. **Rate Limit Bypass**
   ```bash
   # Spam check requests
   for i in {1..100}; do
     openclaw mcp call predictive check &
   done
   ```
   **Expected**: Rate limit enforced

4. **Data Exfiltration**
   ```bash
   # Try to export raw events
   openclaw mcp call predictive history --limit 10000
   ```
   **Expected**: Limited to 100 items max

5. **Permission Bypass**
   ```bash
   # Try to read database as another user
   sudo -u anotheruser cat ~/.openclaw/predictive.db
   ```
   **Expected**: Permission denied

---

## Incident Response

### If Database Compromised

1. **Isolate**: Disconnect from network
2. **Assess**: Determine what data was accessed
3. **Rotate**: Change gateway token if MCP exposed
4. **Clear**: Delete database: `rm ~/.openclaw/predictive.db`
5. **Review**: Check patterns for sensitive inferences
6. **Report**: Notify user immediately

### If MCP Abused

1. **Disable**: Set `predictive.enabled: false`
2. **Revoke**: Rotate gateway token
3. **Audit**: Check MCP logs for suspicious activity
4. **Rate Limit**: Decrease `checkIntervalMs`
5. **Monitor**: Watch for unusual prediction patterns

---

## Compliance

### GDPR Considerations

- **Data Minimization**: Only necessary metadata collected
- **Purpose Limitation**: Only for predictive suggestions
- **Storage Limitation**: 90-day retention (configurable)
- **User Rights**: Can view, delete, disable at any time

### CCPA Considerations

- **No Sale**: Data never sold or shared
- **Access Right**: Users can query patterns anytime
- **Deletion Right**: Users can clear database anytime
- **Opt-Out**: Can disable predictive engine entirely

---

## Conclusion

✅ **Predictive Engine is SECURE for production use**

**Key Strengths**:
- Local-only storage
- No cloud dependencies
- User-controlled data
- Rate limiting and quiet hours
- Minimal data collection

**Recommendations**:
1. Document security features for users
2. Add security section to user guide
3. Consider database encryption option (future)
4. Monitor MCP usage in production

---

*Security Review completed 2026-02-28 - No blocking issues found.*
