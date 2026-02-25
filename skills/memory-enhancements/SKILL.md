# Memory Enhancements Skill

Enhanced memory search with hybrid search (vector + BM25), temporal weighting, and RRF fusion.

## Usage

The enhanced memory system is now wired and can be accessed via:

```bash
cd ~/.openclaw/workspace/memory-enhancements
node wire-enhancements.mjs search "<query>"
node wire-enhancements.mjs status
```

## Features

| Feature             | Status       |
| ------------------- | ------------ |
| Vector Search       | ✅ Working   |
| BM25 Search (FTS5)  | ✅ Working   |
| Hybrid Search (RRF) | ✅ Working   |
| Temporal Weighting  | ✅ Working   |
| Auto-Indexing       | ⏳ Not wired |

## How It Works

1. **Vector Search**: Uses LM Studio embeddings (nomic-embed-text-v1.5)
2. **BM25 Search**: Uses SQLite FTS5 full-text search
3. **RRF Fusion**: Reciprocal Rank Fusion combines both result sets
4. **Temporal Weighting**: Recent documents get higher scores

## Integration

The wiring script is at:

```
~/.openclaw/workspace/memory-enhancements/wire-enhancements.mjs
```

Database:

```
~/.openclaw/memory/main.sqlite
```

## Example

```bash
$ node wire-enhancements.mjs search "heartbeat system"

[hybrid-search] Query: "heartbeat system"
[hybrid-search] Vector results: 4
[hybrid-search] BM25 results: 2
[hybrid-search] Fused results: 4
```
