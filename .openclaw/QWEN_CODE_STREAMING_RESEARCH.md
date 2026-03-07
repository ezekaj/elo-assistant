# 📡 QWEN CODE STREAMING ARCHITECTURE

**Research Date:** 2026-02-24
**Source:** Qwen Code Documentation + Alibaba Cloud Model Studio

---

## 🎯 STREAMING ARCHITECTURE OVERVIEW

Qwen Code uses **SSE (Server-Sent Events)** for streaming AI responses to the terminal.

---

## 🔧 TECHNICAL ARCHITECTURE

### **1. Protocol: SSE (Server-Sent Events)**

**Based on:** Server-Sent Events protocol
**Connection:** Persistent HTTP connection
**Direction:** Server → Client (unidirectional)

```
Client                          Server
  |                               |
  |--- HTTP Request (stream=true) |
  |                               |
  |<-- text/event-stream ---------|
  |<-- data: {"chunk": "..."} ----|
  |<-- data: {"chunk": "..."} ----|
  |<-- data: {"chunk": "..."} ----|
  |<-- [DONE] --------------------|
  |                               |
```

---

### **2. Stream Request Format**

**Endpoint:** `/v1/chat/completions`

**Request:**
```json
{
  "model": "qwen3-coder-plus",
  "messages": [...],
  "stream": true,
  "stream_options": {
    "include_usage": true
  }
}
```

**Headers:**
```
Content-Type: application/json
Accept: text/event-stream
```

---

### **3. Stream Response Format**

**Content-Type:** `text/event-stream`

**Chunk Format:**
```
data: {"id":"chat-123","choices":[{"delta":{"content":"Hello"}}],"object":"chat.completion.chunk"}

data: {"id":"chat-123","choices":[{"delta":{"content":" world"}}],"object":"chat.completion.chunk"}

data: {"id":"chat-123","choices":[{"delta":{},"finish_reason":"stop"}],"object":"chat.completion.chunk"}

data: [DONE]
```

**Each chunk contains:**
- `id`: Chat completion ID
- `choices`: Array with delta content
- `delta.content`: New token/text chunk
- `finish_reason`: When stream ends
- `object`: Always "chat.completion.chunk"

---

### **4. Chunk Processing**

**Client-side processing:**

```typescript
async function handleStream(response: Response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        const parsed = JSON.parse(data);
        const content = parsed.choices[0]?.delta?.content;
        
        // Display token-by-token
        if (content) {
          terminal.write(content);
        }
      }
    }
  }
}
```

---

### **5. Token-by-Token Display**

**Terminal rendering:**

```typescript
// Pseudo-code for terminal streaming
let fullResponse = '';

for await (const chunk of stream) {
  const token = chunk.choices[0]?.delta?.content;
  
  if (token) {
    fullResponse += token;
    
    // Update terminal display
    terminal.clear();
    terminal.write(fullResponse);
    terminal.cursorToEnd();
  }
}
```

**Visual effect:**
```
Hello⎯  (cursor)
Hello world⎯  (cursor)
Hello world!⎯  (cursor)
Hello world! How can I help?⎯  (cursor)
```

---

### **6. Error Handling**

**Stream errors:**

```typescript
try {
  const response = await fetch('/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify({ stream: true })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  await handleStream(response);
  
} catch (error) {
  // Handle connection errors
  // Handle parse errors
  // Handle timeout
}
```

---

### **7. Connection Management**

**Keep-alive:**
```
Connection: keep-alive
Cache-Control: no-cache
```

**Timeout handling:**
- Default timeout: 30-60 seconds
- Reconnect on failure
- Resume from last token (if supported)

---

## 📊 COMPARISON WITH OPENCLAW

### **Qwen Code Streaming:**
- ✅ SSE protocol
- ✅ Token-by-token display
- ✅ Chunked HTTP responses
- ✅ Real-time terminal updates
- ✅ Connection keep-alive

### **OpenClaw Current State:**
- ❌ No streaming implemented yet
- ❌ Full response at once
- ⚠️ Could benefit from SSE streaming

---

## 🎯 IMPLEMENTATION RECOMMENDATIONS FOR OPENCLAW

### **To Add Streaming to OpenClaw:**

**1. Add SSE Support:**
```typescript
// In gateway HTTP handler
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
```

**2. Stream Tool Responses:**
```typescript
// Stream tool execution results
for await (const chunk of toolExecutionStream) {
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}
res.write('data: [DONE]\n\n');
res.end();
```

**3. TUI Streaming Display:**
```typescript
// In TUI
for await (const chunk of stream) {
  const content = chunk.content;
  chatLog.append(content);
  tui.render();
}
```

---

## 📋 BENEFITS OF STREAMING

### **User Experience:**
- ✅ Immediate feedback (no waiting)
- ✅ Token-by-token display (feels responsive)
- ✅ Can stop mid-response if needed
- ✅ Better for long responses

### **Technical:**
- ✅ Lower memory usage (chunked)
- ✅ Better timeout handling
- ✅ Progressive rendering
- ✅ Real-time updates

---

## 🎉 CONCLUSION

**Qwen Code Streaming Architecture:**
- **Protocol:** SSE (Server-Sent Events)
- **Format:** Chunked JSON over text/event-stream
- **Display:** Token-by-token terminal rendering
- **Connection:** Persistent HTTP with keep-alive

**OpenClaw Could Benefit From:**
- Adding SSE streaming support
- Token-by-token TUI display
- Chunked tool execution results
- Real-time response streaming

---

**Research Complete:** 2026-02-24
**Protocol:** SSE (Server-Sent Events)
**Format:** Chunked JSON
**Display:** Token-by-token
