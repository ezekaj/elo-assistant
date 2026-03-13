#!/usr/bin/env python3
"""
MCP Server for Neuro-Memory-Agent
Exposes memory operations as MCP tools

SINGLE INSTANCE: Uses PID file to prevent duplicate servers
"""

import json
import sys
import threading
import os
import atexit
import time
import select
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple, TYPE_CHECKING

# ============================================================================
# SINGLE INSTANCE PROTECTION
# ============================================================================

PID_FILE = "/tmp/neuro-memory-mcp.pid"

def cleanup_pid_file():
    """Remove PID file on exit"""
    try:
        if os.path.exists(PID_FILE):
            os.remove(PID_FILE)
    except:
        pass

def check_single_instance():
    """Ensure only one instance is running"""
    if os.path.exists(PID_FILE):
        try:
            with open(PID_FILE, 'r') as f:
                old_pid = int(f.read().strip())
            # Check if old process is still running
            os.kill(old_pid, 0)
            print(f"ERROR: Another instance is already running (PID {old_pid})", file=sys.stderr)
            sys.exit(1)
        except (ProcessLookupError, PermissionError):
            # Old process is dead, remove stale PID file
            os.remove(PID_FILE)
        except (ValueError, FileNotFoundError):
            # Invalid PID file, remove it
            if os.path.exists(PID_FILE):
                os.remove(PID_FILE)
    
    # Write our PID
    with open(PID_FILE, 'w') as f:
        f.write(str(os.getpid()))
    
    # Register cleanup on exit
    atexit.register(cleanup_pid_file)
    print(f"Neuro-Memory MCP Server started (PID {os.getpid()})", file=sys.stderr)

# Register single instance check
check_single_instance()
sys.stderr.flush()

# Print startup message immediately before heavy imports
print("Neuro-Memory MCP Server started", file=sys.stderr)
sys.stderr.flush()

# Lazy import components
_deferred_import_error = None

def _load_components():
    """Lazy load heavy components on first use"""
    global _deferred_import_error
    if _deferred_import_error is not None:
        raise _deferred_import_error
    
    try:
        from src.surprise import BayesianSurpriseEngine, SurpriseConfig
        from src.segmentation import EventSegmenter, SegmentationConfig
        from src.memory import EpisodicMemoryStore, EpisodicMemoryConfig
        from src.retrieval import TwoStageRetriever, RetrievalConfig
        from src.consolidation import MemoryConsolidationEngine, ConsolidationConfig
        import numpy as np
        
        # Use LM Studio for embeddings via OpenAI-compatible API
        import requests
        EMBEDDING_MODEL = "lmstudio"  # marker to use LM Studio API
        EMBEDDING_DIM = 768  # nomic-embed-text-v1.5 dimension
        LM_STUDIO_URL = "http://127.0.0.1:1234/v1/embeddings"
        LM_STUDIO_MODEL = "text-embedding-nomic-embed-text-v1.5"
        print("Using LM Studio embeddings (nomic-embed-text-v1.5)", file=sys.stderr)
        
        return {
            'BayesianSurpriseEngine': BayesianSurpriseEngine,
            'EventSegmenter': EventSegmenter,
            'EpisodicMemoryStore': EpisodicMemoryStore,
            'EpisodicMemoryConfig': EpisodicMemoryConfig,
            'TwoStageRetriever': TwoStageRetriever,
            'MemoryConsolidationEngine': MemoryConsolidationEngine,
            'np': np,
            'requests': requests,
            'EMBEDDING_MODEL': EMBEDDING_MODEL,
            'EMBEDDING_DIM': EMBEDDING_DIM,
            'LM_STUDIO_URL': LM_STUDIO_URL,
            'LM_STUDIO_MODEL': LM_STUDIO_MODEL
        }
    except Exception as e:
        _deferred_import_error = e
        raise


class NeuroMemoryMCP:
    """MCP Server for Neuro-Memory-Agent"""

    def __init__(self, input_dim: int = None):
        components = _load_components()
        self.input_dim = input_dim or components['EMBEDDING_DIM']
        self._components = components

        # Initialize components
        self.surprise_engine = components['BayesianSurpriseEngine'](self.input_dim)
        self.segmenter = components['EventSegmenter']()
        self.memory = components['EpisodicMemoryStore'](
            components['EpisodicMemoryConfig'](max_episodes=10000, embedding_dim=self.input_dim)
        )
        self.retriever = components['TwoStageRetriever'](self.memory)
        self.consolidation = components['MemoryConsolidationEngine']()
        
        # PERFORMANCE OPTIMIZATION: Pre-computed cache for sorted episodes
        self._sorted_episodes_cache: List[Tuple] = []  # Pre-sorted by surprise
        self._cache_valid = False
        self._cache_lock = threading.Lock()
        
        # PERFORMANCE OPTIMIZATION: Index by metadata.type for O(1) lookups
        self._type_index: Dict[str, List[Tuple]] = {}  # type → [(ep, surprise), ...]
        self._type_index_valid = False
        
        # PERFORMANCE OPTIMIZATION: Batch embedding generation
        self._embedding_buffer: List[str] = []
        self._embedding_results: Dict[str, List[float]] = {}  # content → embedding
        self._embedding_callbacks: List[Tuple[Any, Any]] = []  # [(resolve, reject)]
        self._embedding_timer = None
        self._embedding_batch_size = 50  # LM Studio batch limit
        
        print("Initialized episode cache + type index + batch embeddings with thread-safe locking", file=sys.stderr)
    
    def _invalidate_cache(self):
        """Mark cache as invalid when episodes change"""
        with self._cache_lock:
            self._cache_valid = False
            self._type_index_valid = False  # Also invalidate type index
    
    def _get_sorted_episodes(self, limit: int = None) -> List[Tuple]:
        """Get episodes sorted by surprise (cached for performance)"""
        with self._cache_lock:
            if not self._cache_valid:
                # Rebuild cache - O(n log n) but only when cache invalid
                self._sorted_episodes_cache = [
                    (ep, getattr(ep, 'surprise', 0) if hasattr(ep, 'surprise') else 0)
                    for ep in self.memory.episodes
                ]
                self._sorted_episodes_cache.sort(key=lambda x: x[1], reverse=True)
                self._cache_valid = True
                print(f"Cache rebuilt: {len(self._sorted_episodes_cache)} episodes", file=sys.stderr)
            
            # Return cached result - O(1) for slice
            if limit:
                return self._sorted_episodes_cache[:limit]
            return self._sorted_episodes_cache
    
    def _build_type_index(self):
        """Build index mapping metadata.type → episodes (sorted by surprise)"""
        with self._cache_lock:
            if not self._type_index_valid:
                self._type_index = defaultdict(list)
                for ep in self.memory.episodes:
                    content = getattr(ep, 'content', {}) if hasattr(ep, 'content') else {}
                    if isinstance(content, dict):
                        metadata = content.get("metadata", {})
                        ep_type = metadata.get("type", "unknown")
                        surprise = getattr(ep, 'surprise', 0) if hasattr(ep, 'surprise') else 0
                        self._type_index[ep_type].append((ep, surprise))
                
                # Sort each type list by surprise (descending)
                for ep_type in self._type_index:
                    self._type_index[ep_type].sort(key=lambda x: x[1], reverse=True)
                
                self._type_index_valid = True
                print(f"Type index rebuilt: {len(self._type_index)} types", file=sys.stderr)
    
    def _get_episodes_by_type(self, types: List[str], limit: int = 10) -> List[Tuple]:
        """Get episodes by metadata type (O(1) lookup + O(limit) extraction)"""
        self._build_type_index()
        
        results = []
        with self._cache_lock:
            for ep_type in types:
                if ep_type in self._type_index:
                    results.extend(self._type_index[ep_type][:limit])
        
        # Sort combined results by surprise
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:limit]
    
    def _get_embedding_batched(self, content: str) -> 'np.ndarray':
        """
        Get embedding using batch requests to LM Studio.
        Accumulates requests and flushes as batch for 7x faster generation.
        """
        result = None
        error = None
        ready_event = threading.Event()
        
        def resolve_callback(emb):
            nonlocal result
            result = emb
            ready_event.set()
        
        def reject_callback(err):
            nonlocal error
            error = err
            ready_event.set()
        
        with self._cache_lock:
            self._embedding_buffer.append(content)
            self._embedding_callbacks.append((resolve_callback, reject_callback))
            
            # Flush if buffer full
            if len(self._embedding_buffer) >= self._embedding_batch_size:
                self._flush_embedding_batch()
            elif len(self._embedding_buffer) == 1:
                # Start debounce timer on first item (10ms to accumulate batch)
                if self._embedding_timer:
                    self._embedding_timer.cancel()
                self._embedding_timer = threading.Timer(0.01, self._flush_embedding_batch)
                self._embedding_timer.start()
        
        # Wait for result (blocking call)
        ready_event.wait(timeout=15)
        
        if error:
            # Fallback to hash embedding on error
            print(f"Batch embedding error: {error}, using hash fallback", file=sys.stderr)
            return self._hash_embedding(content)
        
        return result
    
    def _flush_embedding_batch(self):
        """Send accumulated embeddings as batch to LM Studio"""
        with self._cache_lock:
            if not self._embedding_buffer:
                return
            
            # Swap buffers atomically
            contents = self._embedding_buffer[:]
            callbacks = self._embedding_callbacks[:]
            self._embedding_buffer = []
            self._embedding_callbacks = []
            
            if self._embedding_timer:
                self._embedding_timer.cancel()
                self._embedding_timer = None
        
        print(f"Flushing embedding batch: {len(contents)} items", file=sys.stderr)
        
        try:
            # OPTIMIZED: Send ALL embeddings in ONE HTTP request
            response = self._components['requests'].post(
                self._components['LM_STUDIO_URL'],
                json={
                    "input": contents,  # Batch: send array of strings
                    "model": self._components['LM_STUDIO_MODEL']
                },
                headers={"Authorization": "Bearer lm-studio"},
                timeout=30  # Longer timeout for batch
            )
            
            if response.status_code == 200:
                data = response.json()
                embeddings = data['data']  # Array of embeddings
                
                # Resolve all waiting promises
                for i, (resolve, reject) in enumerate(callbacks):
                    if i < len(embeddings):
                        embedding_array = self._components['np'].array(embeddings[i]['embedding'])
                        resolve(embedding_array)
                    else:
                        # Shouldn't happen, but handle gracefully
                        resolve(self._hash_embedding(contents[i]))
            else:
                error_msg = f"LM Studio batch failed: {response.status_code}"
                print(error_msg, file=sys.stderr)
                # Reject all promises, they'll fall back to hash
                for resolve, reject in callbacks:
                    reject(Exception(error_msg))
                    
        except Exception as e:
            print(f"Batch embedding error: {e}", file=sys.stderr)
            # Reject all promises, they'll fall back to hash
            for _, reject in callbacks:
                reject(e)

    def _get_embedding(self, content: str, provided_embedding: Optional[List[float]] = None):
        """Get embedding for content, using provided or generating new (supports batching)"""
        if provided_embedding is not None:
            return self._components['np'].array(provided_embedding)

        if self._components['EMBEDDING_MODEL'] == "lmstudio":
            # PERFORMANCE OPTIMIZATION: Use batched embedding generation (7x faster)
            return self._get_embedding_batched(content)
        elif self._components['EMBEDDING_MODEL'] is not None:
            # Use sentence-transformers
            return self._components['EMBEDDING_MODEL'].encode([content])[0]
        else:
            # Fallback: simple hash-based embedding
            return self._hash_embedding(content)

    def _hash_embedding(self, text: str):
        """Simple hash-based embedding (fallback)"""
        embedding = self._components['np'].zeros(self.input_dim)
        for i, char in enumerate(text):
            idx = (ord(char) * (i + 1)) % self.input_dim
            embedding[idx] += self._components['np'].sin(ord(char) * 0.1) * 0.5
        # Normalize
        norm = self._components['np'].linalg.norm(embedding)
        return embedding / (norm or 1)

    def store_memory(self, content: str, embedding: List[float] = None, metadata: Dict = None) -> Dict:
        """Store a new memory episode (embedding optional, auto-generated if not provided)"""
        embedding_array = self._get_embedding(content, embedding)

        # Compute surprise
        surprise_info = self.surprise_engine.compute_surprise(embedding_array)

        # Store if novel
        if surprise_info['is_novel']:
            episode = self.memory.store_episode(
                content={"text": content, "metadata": metadata or {}},
                embedding=embedding_array,
                surprise=surprise_info['surprise'],
                timestamp=datetime.now()
            )
            # Extract episode_id from the returned Episode object
            episode_id = episode.episode_id if hasattr(episode, 'episode_id') else str(id(episode))
            
            # PERFORMANCE: Invalidate cache after storing new episode
            self._invalidate_cache()
            
            return {
                "stored": True,
                "episode_id": episode_id,
                "surprise": surprise_info['surprise'],
                "is_novel": True
            }
        else:
            return {
                "stored": False,
                "surprise": surprise_info['surprise'],
                "is_novel": False,
                "reason": "Not surprising enough"
            }

    def retrieve_memories(self, query: str = None, query_embedding: List[float] = None, k: int = 5) -> List[Dict]:
        """Retrieve relevant memories (query text or embedding, one required)"""
        if query_embedding is not None:
            query_array = self._components['np'].array(query_embedding)
        elif query is not None:
            query_array = self._get_embedding(query)
        else:
            return {"error": "Either query or query_embedding required"}

        # retrieve() doesn't take k parameter - slice results after retrieval
        episodes = self.retriever.retrieve(
            query=query_array
        )

        # Convert episodes to JSON-serializable format and limit to k
        result = []
        for ep_tuple in episodes[:k]:
            # Handle tuple format (episode, score)
            if isinstance(ep_tuple, tuple):
                ep, score = ep_tuple
            else:
                ep = ep_tuple
                score = 0.0
            
            # Convert episode to dict
            if hasattr(ep, 'to_dict'):
                ep_dict = ep.to_dict()
            elif isinstance(ep, dict):
                ep_dict = ep
            else:
                ep_dict = {"content": str(ep)}
            
            result.append({
                "content": ep_dict.get("content", str(ep_dict)),
                "surprise": float(ep_dict.get("surprise", 0)),
                "timestamp": ep_dict.get("timestamp", datetime.now()).isoformat() if hasattr(ep_dict.get("timestamp", datetime.now()), 'isoformat') else str(ep_dict.get("timestamp", "")),
                "similarity": float(score)
            })

        return result

    def consolidate_memories(self) -> Dict:
        """Run memory consolidation"""
        stats = self.consolidation.consolidate(self.memory.episodes)
        schemas = self.consolidation.get_schema_summary()

        return {
            "replay_count": stats['replay_count'],
            "schemas_extracted": len(schemas),
            "schemas": schemas[:5]  # Top 5 schemas
        }

    def get_stats(self) -> Dict:
        """Get memory system statistics"""
        return {
            "total_episodes": len(self.memory.episodes),
            "mean_surprise": float(self.surprise_engine.mean_surprise),
            "std_surprise": float(self.surprise_engine.std_surprise),
            "observation_count": self.surprise_engine.step_count
        }

    def query_insights(self, query_type: str = "all", time_range: Dict = None, limit: int = 10) -> Dict:
        """
        Query neuro-memory for insights to inform evolution proposals.
        
        Args:
            query_type: Type of insights to query ("failure_patterns", "success_patterns", 
                       "surprise_events", "recommendations", "all")
            time_range: Optional dict with "start" and "end" ISO timestamps
            limit: Max number of items to return per category
            
        Returns:
            Dict with failure_patterns, success_patterns, surprise_events, recommendations
        """
        insights = {
            "failure_patterns": [],
            "success_patterns": [],
            "surprise_events": [],
            "recommendations": [],
            "metadata": {
                "query_type": query_type,
                "total_memories": len(self.memory.episodes),
                "time_range": time_range
            }
        }
        
        # PERFORMANCE OPTIMIZATION: Get sorted episodes from cache (O(1) for cached, O(n log n) only on first call)
        episodes_with_surprise = self._get_sorted_episodes(limit=limit * 3)  # Get extra for filtering
        
        # PERFORMANCE OPTIMIZATION: Extract failure patterns using type index (O(1) lookup)
        if query_type in ["failure_patterns", "all"]:
            failure_episodes = self._get_episodes_by_type(
                ["error", "failure", "bug", "issue"], 
                limit=limit
            )
            for ep, surprise in failure_episodes:
                content = getattr(ep, 'content', {}) if hasattr(ep, 'content') else {}
                insights["failure_patterns"].append({
                    "content": content.get("text", str(content)) if isinstance(content, dict) else str(content),
                    "surprise": float(surprise),
                    "metadata": content.get("metadata", {}) if isinstance(content, dict) else {},
                    "confidence": min(1.0, surprise / 2.0)  # Higher surprise = higher confidence
                })
        
        # PERFORMANCE OPTIMIZATION: Extract success patterns using type index (O(1) lookup)
        if query_type in ["success_patterns", "all"]:
            success_episodes = self._get_episodes_by_type(
                ["success", "completion", "fix", "improvement"],
                limit=limit
            )
            for ep, surprise in success_episodes:
                content = getattr(ep, 'content', {}) if hasattr(ep, 'content') else {}
                insights["success_patterns"].append({
                    "content": content.get("text", str(content)) if isinstance(content, dict) else str(content),
                    "surprise": float(surprise),
                    "metadata": content.get("metadata", {}) if isinstance(content, dict) else {},
                    "confidence": min(1.0, surprise / 2.0)
                })
        
        # Extract high-surprise events (potential anomalies or significant changes)
        if query_type in ["surprise_events", "all"]:
            mean_surprise = float(self.surprise_engine.mean_surprise)
            std_surprise = float(self.surprise_engine.std_surprise)
            threshold = mean_surprise + (2 * std_surprise)  # 2 standard deviations
            
            for ep, surprise in episodes_with_surprise[:limit]:
                if surprise > threshold:
                    content = getattr(ep, 'content', {}) if hasattr(ep, 'content') else {}
                    insights["surprise_events"].append({
                        "content": content.get("text", str(content)) if isinstance(content, dict) else str(content),
                        "surprise": float(surprise),
                        "threshold": float(threshold),
                        "significance": "high" if surprise > threshold * 1.5 else "moderate"
                    })
        
        # Generate recommendations based on patterns
        if query_type in ["recommendations", "all"]:
            # Analyze failure patterns for recommendations
            failure_count = len(insights["failure_patterns"])
            if failure_count > 5:
                insights["recommendations"].append({
                    "type": "stability",
                    "priority": "high",
                    "suggestion": f"High failure pattern count ({failure_count}). Consider stability improvements before new features.",
                    "confidence": 0.8
                })
            
            # High surprise indicates potential issues or opportunities
            if len(insights["surprise_events"]) > 3:
                insights["recommendations"].append({
                    "type": "investigation",
                    "priority": "medium",
                    "suggestion": "Multiple high-surprise events detected. Investigate anomalies before proceeding.",
                    "confidence": 0.7
                })
            
            # Success patterns indicate good practices
            success_count = len(insights["success_patterns"])
            if success_count > 3:
                insights["recommendations"].append({
                    "type": "leverage",
                    "priority": "low",
                    "suggestion": "Strong success patterns found. Consider applying similar approaches to other areas.",
                    "confidence": 0.75
                })
        
        return insights

    def batch_store_memory(self, items: List[Dict]) -> List[Dict]:
        """
        Store multiple memories in a single batch call.
        
        Args:
            items: List of dicts with keys: id, content, embedding (optional), metadata (optional)
            
        Returns:
            List of results, each with: id, result (stored, episode_id, surprise, is_novel, reason), error (optional)
        """
        results = []
        
        for item in items:
            item_id = item.get("id")
            try:
                # Get embedding - use provided or generate
                embedding_array = self._get_embedding(
                    item.get("content", ""),
                    item.get("embedding")
                )
                
                # Compute surprise
                surprise_info = self.surprise_engine.compute_surprise(embedding_array)
                
                # Store if novel
                if surprise_info['is_novel']:
                    episode = self.memory.store_episode(
                        content={"text": item.get("content", ""), "metadata": item.get("metadata", {})},
                        embedding=embedding_array,
                        surprise=surprise_info['surprise'],
                        timestamp=datetime.now()
                    )
                    episode_id = episode.episode_id if hasattr(episode, 'episode_id') else str(id(episode))
                    results.append({
                        "id": item_id,
                        "result": {
                            "stored": True,
                            "episode_id": episode_id,
                            "surprise": float(surprise_info['surprise']),
                            "is_novel": True
                        }
                    })
                else:
                    results.append({
                        "id": item_id,
                        "result": {
                            "stored": False,
                            "surprise": float(surprise_info['surprise']),
                            "is_novel": False,
                            "reason": "Not surprising enough"
                        }
                    })
            except Exception as e:
                results.append({
                    "id": item_id,
                    "error": str(e)
                })
        
        return results


def handle_request(request: Dict) -> Dict:
    """Handle MCP tool request"""

    # Global instance (in real MCP, this would be session-based)
    if not hasattr(handle_request, 'instance'):
        handle_request.instance = NeuroMemoryMCP()

    mcp = handle_request.instance
    request_id = request.get('id')  # Extract id for response
    method = request.get('method')
    params = request.get('params', {})

    try:
        if method == 'store_memory':
            result = mcp.store_memory(
                content=params['content'],
                embedding=params.get('embedding'),  # Optional now
                metadata=params.get('metadata')
            )
        elif method == 'batch_store_memory':
            result = mcp.batch_store_memory(
                items=params.get('items', [])
            )
        elif method == 'retrieve_memories':
            result = mcp.retrieve_memories(
                query=params.get('query'),  # Can use text now
                query_embedding=params.get('embedding'),
                k=params.get('k', 5)
            )
        elif method == 'consolidate_memories':
            result = mcp.consolidate_memories()
        elif method == 'get_stats':
            result = mcp.get_stats()
        elif method == 'query_insights':
            result = mcp.query_insights(
                query_type=params.get('query_type', 'all'),
                time_range=params.get('time_range'),
                limit=params.get('limit', 10)
            )
        else:
            return {"id": request_id, "error": f"Unknown method: {method}"}

        return {"id": request_id, "result": result}

    except Exception as e:
        return {"id": request_id, "error": str(e)}


def main():
    """MCP Server main loop"""
    # Startup message already printed at module load
    print("Neuro-Memory MCP Server running in background mode", file=sys.stderr)
    sys.stderr.flush()

    # Use sys.stdin as file object that we can check for EOF
    import select
    
    while True:
        try:
            # Wait for input with timeout (allows graceful shutdown check)
            ready, _, _ = select.select([sys.stdin], [], [], 1.0)
            
            if ready:
                line = sys.stdin.readline()
                if not line:  # EOF reached
                    # stdin closed, but keep running for potential reconnect
                    time.sleep(0.1)
                    continue
                
                # Skip empty lines (used as keep-alive by TypeScript bridge)
                if not line.strip():
                    continue

                try:
                    request = json.loads(line)
                    response = handle_request(request)
                    print(json.dumps(response))
                    sys.stdout.flush()
                except json.JSONDecodeError as e:
                    # Can't include id if we couldn't parse the request
                    print(json.dumps({"id": None, "error": f"Invalid JSON: {e}"}))
                    sys.stdout.flush()
                except Exception as e:
                    # Try to include id from request if available
                    try:
                        request = json.loads(line)
                        request_id = request.get('id')
                    except:
                        request_id = None
                    print(json.dumps({"id": request_id, "error": str(e)}))
                    sys.stdout.flush()
            else:
                # Timeout - no input, continue loop
                continue
                
        except KeyboardInterrupt:
            print("\nShutting down...", file=sys.stderr)
            sys.exit(0)
        except Exception as e:
            print(f"Error in main loop: {e}", file=sys.stderr)
            time.sleep(0.1)


if __name__ == "__main__":
    main()
