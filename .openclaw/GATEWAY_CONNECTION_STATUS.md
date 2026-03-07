# 🔌 Gateway Connection Status & Setup

**Date:** 2026-02-25  
**Status:** ⚠️ **GATEWAY NOT RUNNING**

---

## 📊 **CURRENT STATUS**

### **OpenClaw Processes:**
| Process | Status | PID |
|---------|--------|-----|
| `openclaw-tui` | ✅ Running | 99042 |
| `openclaw` (CLI) | ✅ Running | 99041 |
| **Gateway** | ❌ **Not Running** | - |

### **Gateway Port:**
- **Expected Port:** 18789 (default) or 19001 (dev mode)
- **Status:** ❌ Not listening
- **Command:** `lsof -i :18789` → No results

---

## 🔧 **HOW TO START THE GATEWAY**

### **Option 1: Start Gateway Manually**

```bash
# Start gateway in foreground
openclaw gateway

# Or with custom port
openclaw gateway --port 18789

# Or in dev mode (port 19001)
openclaw gateway --dev
```

### **Option 2: Install as Daemon (Recommended)**

**macOS (launchd):**
```bash
# Install gateway as launchd service
openclaw daemon install

# Start the service
openclaw daemon start

# Check status
openclaw daemon status
```

**Linux (systemd):**
```bash
# Install gateway as systemd service
openclaw daemon install --runtime systemd

# Start the service
sudo systemctl start openclaw

# Enable on boot
sudo systemctl enable openclaw

# Check status
systemctl status openclaw
```

**Windows (schtasks):**
```bash
# Install gateway as scheduled task
openclaw daemon install --runtime schtasks

# Start the service
openclaw daemon start

# Check status
openclaw daemon status
```

### **Option 3: Use TUI (Auto-starts Gateway)**

```bash
# TUI will automatically connect to or start the gateway
openclaw tui
```

---

## ✅ **VERIFICATION**

### **Check Gateway Status:**

```bash
# Check if port is listening
lsof -i :18789

# Or use netstat
netstat -an | grep 18789

# Check gateway health
openclaw health

# View gateway logs
openclaw logs
```

### **Expected Output:**

```bash
# lsof output when gateway is running:
COMMAND   PID   USER   TYPE   DEVICE SIZE/OFF NODE NAME
node     1234  tolga    4u  IPv6 123456      0t0  TCP *:18789 (LISTEN)
```

---

## 🔗 **CONNECTION FLOW**

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  OpenClaw   │────▶│   Gateway    │────▶│   Models    │
│     TUI     │ WS  │  (Port 18789)│ HTTP│  (APIs)     │
└─────────────┘     └──────────────┘     └─────────────┘
       │                   │                    │
       │                   │                    │
       ▼                   ▼                    ▼
  User Interface    Message Router      AI Providers:
  - Chat input      - Session mgmt      - Zhipu (GLM)
  - Tool results    - Auth handling     - OpenRouter
  - File ops        - Rate limiting     - Claude Proxy
  - Memory          - Tool invocation   - LM Studio
```

---

## 🛠️ **GATEWAY CONFIGURATION**

### **Current Config (from openclaw.json):**

```json
{
  "gateway": {
    "mode": "local",
    "auth": {
      "token": "test123"
    }
  }
}
```

### **Gateway Settings:**

| Setting | Value | Description |
|---------|-------|-------------|
| **Mode** | local | Local gateway (not remote) |
| **Port** | 18789 | Default WebSocket port |
| **Auth** | token | Token-based authentication |
| **Token** | test123 | Shared auth token |

---

## 🔐 **AUTHENTICATION**

### **Gateway Token:**

The gateway uses token-based authentication:

```bash
# Connect with token
openclaw tui --gateway-token test123

# Or set environment variable
export OPENCLAW_GATEWAY_TOKEN=test123
openclaw tui
```

### **Change Gateway Token:**

```bash
# Update token in config
openclaw config set gateway.auth.token your_secure_token

# Restart gateway for changes to take effect
openclaw daemon restart
```

---

## 📡 **REMOTE CONNECTION**

### **Connect to Remote Gateway:**

```bash
# Connect to remote gateway
openclaw tui --remote-url ws://remote-host:18789 --remote-token your_token

# Or set in config
openclaw config set gateway.remoteUrl ws://remote-host:18789
openclaw config set gateway.remoteToken your_token
```

### **Enable Remote Access:**

```bash
# Start gateway with remote binding
openclaw gateway --bind tailnet  # Tailscale network
openclaw gateway --bind lan      # Local network
openclaw gateway --bind auto     # Auto-detect
```

---

## 🐛 **TROUBLESHOOTING**

### **Gateway Won't Start:**

```bash
# Check for port conflicts
lsof -i :18789

# Kill existing process if needed
kill -9 <PID>

# Try starting again
openclaw gateway
```

### **Connection Refused:**

```bash
# Check if gateway is running
ps aux | grep openclaw

# Check firewall settings
sudo lsof -i :18789

# Verify token matches
openclaw config get gateway.auth.token
```

### **WebSocket Errors:**

```bash
# Check gateway logs
openclaw logs --tail 100

# Restart gateway
openclaw daemon restart

# Check network connectivity
ping localhost
```

---

## 📊 **GATEWAY ENDPOINTS**

When running, the gateway exposes:

| Endpoint | Port | Protocol | Purpose |
|----------|------|----------|---------|
| **WebSocket** | 18789 | WS | TUI connection |
| **HTTP API** | 18789 | HTTP | Tool invocation |
| **Health** | 18789/health | HTTP | Health checks |
| **Sessions** | 18789/sessions | HTTP | Session management |

---

## 🎯 **QUICK START**

### **1. Start Gateway:**
```bash
openclaw daemon install  # Install as service
openclaw daemon start    # Start service
```

### **2. Verify:**
```bash
openclaw health          # Check health
lsof -i :18789           # Verify port
```

### **3. Connect TUI:**
```bash
openclaw tui             # Open terminal UI
```

### **4. Use:**
```
You: @grep TODO in ./src
Bot: ✓ Found 23 matches in 12 files
```

---

## 📝 **NEXT STEPS**

1. **Start Gateway:**
   ```bash
   openclaw daemon install
   openclaw daemon start
   ```

2. **Verify Connection:**
   ```bash
   lsof -i :18789
   openclaw health
   ```

3. **Launch TUI:**
   ```bash
   openclaw tui
   ```

4. **Test Native Modules:**
   ```
   @grep import in ./src
   @file_search config
   ```

---

**Gateway Status:** ❌ **NOT RUNNING**  
**Action Required:** Start gateway with `openclaw daemon install && openclaw daemon start`  
**Expected Result:** Gateway listening on port 18789, TUI can connect  

---

**Last Updated:** 2026-02-25  
**Next Check:** After gateway start
