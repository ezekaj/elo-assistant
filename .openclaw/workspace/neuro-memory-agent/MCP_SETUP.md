# Running Neuro-Memory-Agent as MCP Server

## Quick Decision Guide

### Use as Python Library (Recommended) ✅
**When:**
- Building chatbot/agent from scratch
- Custom integration needed
- Maximum control over memory logic
- Part of larger Python application

**How:**
```python
from src.memory import EpisodicMemoryStore
from src.retrieval import TwoStageRetriever

memory = EpisodicMemoryStore(...)
# Use directly in your code
```

### Use as MCP Server ⚙️
**When:**
- Integrating with Claude Code
- Want memory accessible across multiple tools
- Building multi-agent systems
- Need standardized API

## MCP Server Setup (5 minutes)

### 1. Install as MCP Server

Add to Claude Code settings (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "neuro-memory": {
      "command": "python",
      "args": [
        "C:/Users/User/Desktop/neuro-memory-agent/mcp_server.py"
      ]
    }
  }
}
```

### 2. Available MCP Tools

Once configured, you get 4 tools in Claude Code:

#### `mcp__neuro-memory__store_memory`
```json
{
  "content": "User discussed their favorite restaurant in Paris",
  "embedding": [0.123, 0.456, ...],  // 768-dim vector
  "metadata": {"topic": "restaurants", "location": "Paris"}
}
```

#### `mcp__neuro-memory__retrieve_memories`
```json
{
  "embedding": [0.789, 0.012, ...],  // Query vector
  "k": 5  // Number of results
}
```

#### `mcp__neuro-memory__consolidate_memories`
```json
{}  // No params, runs consolidation
```

#### `mcp__neuro-memory__get_stats`
```json
{}  // Returns memory statistics
```

### 3. Usage Example in Claude Code

```
User: "Remember that I love Italian food"

Claude internally:
1. Generate embedding for "I love Italian food"
2. Call mcp__neuro-memory__store_memory with embedding
3. System stores if surprising/novel

Later...

User: "What food do I like?"

Claude internally:
1. Generate embedding for query
2. Call mcp__neuro-memory__retrieve_memories
3. Get relevant memories including "loves Italian food"
4. Answer with context
```

## Comparison

| Feature | Python Library | MCP Server |
|---------|---------------|------------|
| **Setup** | Import in code | Configure in settings |
| **Flexibility** | Maximum | Limited to 4 tools |
| **Integration** | Manual | Automatic in Claude |
| **Performance** | Direct (fastest) | IPC overhead (~5ms) |
| **Use case** | Custom apps | Claude Code integration |
| **Code** | Full control | Standardized API |

## Recommended Approach

**For most users: Start with Python Library**

1. More flexible
2. Easier to customize
3. Better performance
4. Full access to all components

**Use MCP Server only if:**
- You specifically need Claude Code integration
- Building multi-tool workflows
- Want standardized memory API across tools

## Example: Both Approaches

### Python Library (Direct)
```python
# app.py
from src.memory import EpisodicMemoryStore
from sentence_transformers import SentenceTransformer

encoder = SentenceTransformer('all-MiniLM-L6-v2')
memory = EpisodicMemoryStore(...)

# Store
embedding = encoder.encode("I love pizza")
memory.store_episode(embedding=embedding, ...)

# Retrieve
query_emb = encoder.encode("What food do I like?")
results = retriever.retrieve(query_emb, k=5)
```

### MCP Server (Via Claude Code)
```python
# In Claude Code, I automatically:
1. Detect memory operation needed
2. Generate embedding (using my built-in encoder)
3. Call mcp__neuro-memory__store_memory or retrieve_memories
4. Use results in response
```

## Performance Notes

**Python Library:**
- Direct function calls
- ~40ms retrieval
- Full control

**MCP Server:**
- JSON serialization overhead
- ~45ms retrieval (+5ms)
- Standardized interface

**Verdict:** Difference is negligible (<10%), choose based on integration needs.

## Next Steps

### For Python Library Integration:
```bash
cd Desktop/neuro-memory-agent
python examples/complete_system.py  # See full example
# Then follow USAGE_GUIDE.md
```

### For MCP Server:
```bash
# 1. Test MCP server works
echo '{"method":"get_stats","params":{}}' | python mcp_server.py

# 2. Add to Claude Code settings
# 3. Restart Claude Code
# 4. Tools will be available as mcp__neuro-memory__*
```

## Which Should You Choose?

**Choose Python Library if:**
- ✅ Building your own application
- ✅ Need maximum flexibility
- ✅ Want to customize components
- ✅ Familiar with Python

**Choose MCP Server if:**
- ✅ Using Claude Code heavily
- ✅ Want plug-and-play integration
- ✅ Building multi-tool workflows
- ✅ Need standardized API

**My Recommendation:** Start with Python Library (USAGE_GUIDE.md), add MCP later if needed.
