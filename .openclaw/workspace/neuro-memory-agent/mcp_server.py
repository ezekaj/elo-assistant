#!/usr/bin/env python3
"""
MCP Server for Neuro-Memory-Agent
Exposes memory operations as MCP tools
"""

import json
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional

from src.surprise import BayesianSurpriseEngine, SurpriseConfig
from src.segmentation import EventSegmenter, SegmentationConfig
from src.memory import EpisodicMemoryStore, EpisodicMemoryConfig
from src.retrieval import TwoStageRetriever, RetrievalConfig
from src.consolidation import MemoryConsolidationEngine, ConsolidationConfig

import numpy as np

# Try to load sentence-transformers for embedding generation
try:
    from sentence_transformers import SentenceTransformer
    EMBEDDING_MODEL = SentenceTransformer('all-MiniLM-L6-v2')
    EMBEDDING_DIM = 384
except ImportError:
    EMBEDDING_MODEL = None
    EMBEDDING_DIM = 768
    print("Warning: sentence-transformers not available, using hash embeddings", file=sys.stderr)


class NeuroMemoryMCP:
    """MCP Server for Neuro-Memory-Agent"""

    def __init__(self, input_dim: int = None):
        self.input_dim = input_dim or EMBEDDING_DIM

        # Initialize components
        self.surprise_engine = BayesianSurpriseEngine(self.input_dim)
        self.segmenter = EventSegmenter()
        self.memory = EpisodicMemoryStore(
            EpisodicMemoryConfig(max_episodes=10000, embedding_dim=self.input_dim)
        )
        self.retriever = TwoStageRetriever(self.memory)
        self.consolidation = MemoryConsolidationEngine()

    def _get_embedding(self, content: str, provided_embedding: Optional[List[float]] = None) -> np.ndarray:
        """Get embedding for content, using provided or generating new"""
        if provided_embedding is not None:
            return np.array(provided_embedding)
        
        if EMBEDDING_MODEL is not None:
            # Use sentence-transformers
            return EMBEDDING_MODEL.encode([content])[0]
        else:
            # Fallback: simple hash-based embedding
            return self._hash_embedding(content)

    def _hash_embedding(self, text: str) -> np.ndarray:
        """Simple hash-based embedding (fallback)"""
        embedding = np.zeros(self.input_dim)
        for i, char in enumerate(text):
            idx = (ord(char) * (i + 1)) % self.input_dim
            embedding[idx] += np.sin(ord(char) * 0.1) * 0.5
        # Normalize
        norm = np.linalg.norm(embedding)
        return embedding / (norm or 1)

    def store_memory(self, content: str, embedding: List[float] = None, metadata: Dict = None) -> Dict:
        """Store a new memory episode (embedding optional, auto-generated if not provided)"""
        embedding_array = self._get_embedding(content, embedding)

        # Compute surprise
        surprise_info = self.surprise_engine.compute_surprise(embedding_array)

        # Store if novel
        if surprise_info['is_novel']:
            episode_id = self.memory.store_episode(
                content={"text": content, "metadata": metadata or {}},
                embedding=embedding_array,
                surprise=surprise_info['surprise'],
                timestamp=datetime.now()
            )
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
            query_array = np.array(query_embedding)
        elif query is not None:
            query_array = self._get_embedding(query)
        else:
            return {"error": "Either query or query_embedding required"}

        episodes = self.retriever.retrieve(
            query_embedding=query_array,
            k=k,
            temporal_weight=0.3
        )

        return [
            {
                "content": ep['content'],
                "surprise": float(ep['surprise']),
                "timestamp": ep['timestamp'].isoformat(),
                "similarity": float(ep.get('similarity', 0))
            }
            for ep in episodes
        ]

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


def handle_request(request: Dict) -> Dict:
    """Handle MCP tool request"""

    # Global instance (in real MCP, this would be session-based)
    if not hasattr(handle_request, 'instance'):
        handle_request.instance = NeuroMemoryMCP()

    mcp = handle_request.instance
    method = request.get('method')
    params = request.get('params', {})

    try:
        if method == 'store_memory':
            result = mcp.store_memory(
                content=params['content'],
                embedding=params.get('embedding'),  # Optional now
                metadata=params.get('metadata')
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
        else:
            return {"error": f"Unknown method: {method}"}

        return {"result": result}

    except Exception as e:
        return {"error": str(e)}


def main():
    """MCP Server main loop"""
    print("Neuro-Memory MCP Server started", file=sys.stderr)

    for line in sys.stdin:
        try:
            request = json.loads(line)
            response = handle_request(request)
            print(json.dumps(response))
            sys.stdout.flush()
        except Exception as e:
            print(json.dumps({"error": str(e)}))
            sys.stdout.flush()


if __name__ == "__main__":
    main()
