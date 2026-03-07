# ⚠️ Inactive OpenClaw Features

**Date:** 2026-02-20 17:26
**Purpose:** Features that exist but are not yet activated

---

## 🔴 HIGH-VALUE FEATURES (Ready to Activate)

### 1. Audio Understanding & Voice Features
**Status:** ❌ Not Configured
**Files:**
- `src/media/audio.ts`
- `src/media-understanding/providers/*/audio.ts`
- `src/infra/voicewake.ts`

**Capabilities:**
- Voice message transcription (Google, Deepgram, OpenAI)
- Audio file analysis
- Speech-to-text for all audio attachments
- Voice wake detection ("Hey OpenClaw")

**Activation:**
```json
{
  "tools": {
    "media": {
      "audio": {
        "enabled": true,
        "provider": "google|deepgram|openai",
        "apiKey": "YOUR_API_KEY"
      }
    }
  }
}
```

**Why valuable:** Transcribe voice messages, understand audio files, hands-free voice activation

---

### 2. Talk (Text-to-Speech)
**Status:** ❌ Not Configured
**Files:**
- `src/config/talk.ts`
- TTS providers in media

**Capabilities:**
- Read responses aloud
- Multiple voice options
- Platform-specific TTS

**Activation:** Add `talk` config with API keys

**Why valuable:** Voice responses, accessibility, hands-free operation

---

### 3. Voice Wake Detection
**Status:** ❌ Not Enabled
**Files:**
- `src/infra/voicewake.ts`
- `src/gateway/server-methods/voicewake.ts`

**Capabilities:**
- "Hey OpenClaw" activation
- Hands-free voice commands
- Background listening

**Activation:**
```json
{
  "voicewake": {
    "enabled": true,
    "model": "path/to/wake-word.model"
  }
}
```

**Why valuable:** True voice assistant experience

---

### 4. Presence System
**Status:** ❌ Not Configured
**Files:**
- `src/infra/system-presence.ts`
- `src/discord/monitor/presence-cache.ts`

**Capabilities:**
- Show when you're typing
- Online/offline status
- Activity status (playing, listening, etc.)
- Custom status messages

**Activation:** Add `presence` config

**Why valuable:** Rich presence across platforms, status automation

---

### 5. Hooks System
**Status:** ❌ Not Configured
**Files:**
- `src/config/types.hooks.ts`
- `src/plugins/hooks.ts`
- `src/agents/bootstrap-hooks.ts`

**Capabilities:**
- Lifecycle event interception
- Pre/post message processing
- Custom triggers
- Event-driven automation

**Activation:**
```json
{
  "hooks": {
    "enabled": true,
    "entries": {
      "beforeMessage": "./hooks/before-message.js",
      "afterMessage": "./hooks/after-message.js"
    }
  }
}
```

**Why valuable:** Custom automation, message filtering, advanced workflows

---

## 🟡 MEDIUM-VALUE FEATURES (Partial Setup)

### 6. Canvas (Visual UI)
**Status:** ⚠️ Available but not used
**Capabilities:**
- Present visual interfaces
- Render HTML/CSS/JS
- Interactive dashboards
- Custom UI overlays

**Why valuable:** Visual data presentation, dashboards, custom interfaces

---

### 7. Node Pairing (Remote Devices)
**Status:** ✅ One node connected (MacBook Pro 2)
**Capabilities:**
- Control remote devices
- Execute commands on nodes
- Browser proxy to nodes
- Screen recording
- Camera access

**Current:** 1 node paired
**Potential:** Add more devices (phones, tablets, other computers)

**Why valuable:** Multi-device control, remote automation

---

### 8. Camera/Screen Recording
**Status:** ⚠️ Available via nodes but not used
**Files:** Node pairing provides these capabilities

**Capabilities:**
- Take photos from device cameras
- Record screen activity
- Real-time screen viewing
- Location tracking

**Why valuable:** Remote monitoring, device management, automation

---

## 🟢 ADVANCED FEATURES (Needs Integration)

### 9. Memory-Enhancements Module
**Status:** ✅ Built (3,660 lines) but not integrated
**Location:** `memory-enhancements/`

**Capabilities:**
- Hybrid search (BM25 + Vector)
- Auto-indexing of files
- Temporal weighting (recent = more relevant)
- Cross-encoder reranking
- Better memory recall

**Next Step:** Integrate into main memory pipeline

**Why valuable:** 10x better memory search accuracy

---

### 10. Discord Rich Presence
**Status:** ❌ Not Configured
**Files:**
- `src/agents/tools/discord-actions-presence.ts`

**Capabilities:**
- Custom Discord status
- Activity display (playing, listening, watching)
- Rich presence with images
- Dynamic status updates

**Why valuable:** Discord integration, status automation

---

## 📊 SUMMARY

### Immediate Activation (High Value):
1. **Audio Understanding** - Transcribe voice messages
2. **Voice Wake** - "Hey OpenClaw" activation
3. **Talk (TTS)** - Voice responses
4. **Presence** - Rich status across platforms
5. **Hooks** - Custom automation triggers

### Medium Priority:
6. **Canvas** - Visual interfaces
7. **Node expansion** - Add more devices
8. **Camera/Screen** - Remote monitoring

### Integration Needed:
9. **Memory-enhancements** - Better search accuracy
10. **Discord Presence** - Discord integration

---

## 🚀 QUICK WINS (Can Activate Now)

**1. Audio Understanding:**
```json
{
  "tools": {
    "media": {
      "audio": {
        "enabled": true,
        "provider": "openai",
        "apiKey": "your-key"
      }
    }
  }
}
```

**2. Hooks:**
Create simple hook files for automation

**3. Use Canvas:**
Just ask: "Show me a dashboard" or "Present this data visually"

**4. Expand Nodes:**
Add your phone, other computers

**5. Discord Presence:**
Add Discord channel config

---

## 🎯 RECOMMENDATION

**Start with:**
1. Audio Understanding (most valuable for voice messages)
2. Voice Wake (true voice assistant)
3. Talk/TTS (voice responses)
4. Memory-enhancements integration (better search)

These will give you the most immediate productivity boost!

---

*Generated: 2026-02-20 17:26*
*Total Inactive Features: 10*
*High-Value Ready: 5*
