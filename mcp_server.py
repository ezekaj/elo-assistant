#!/usr/bin/env python3
"""
MCP Server for Neuro-Memory-Agent
Exposes memory operations as MCP tools
"""

import json
import sys
from datetime import datetime
from typing import Any, Dict, List

from src.surprise import BayesianSurpriseEngine, SurpriseConfig
from src.segmentation import EventSegmenter, SegmentationConfig
from src.memory import EpisodicMemoryStore, EpisodicMemoryConfig
from src.retrieval import TwoStageRetriever, RetrievalConfig
from src.consolidation import MemoryConsolidationEngine, ConsolidationConfig

import numpy as np


class NeuroMemoryMCP:
    """MCP Server for Neuro-Memory-Agent"""

    def __init__(self, input_dim: int = 768):
        self.input_dim = input_dim

        # Initialize components
        self.surprise_engine = BayesianSurpriseEngine(input_dim)
        self.segmenter = EventSegmenter()
        self.memory = EpisodicMemoryStore(
            EpisodicMemoryConfig(max_episodes=10000, embedding_dim=input_dim)
        )
        self.retriever = TwoStageRetriever(self.memory)
        self.consolidation = MemoryConsolidationEngine()

    def store_memory(self, content: str, embedding: List[float], metadata: Dict = None) -> Dict:
        """Store a new memory episode"""
        embedding_array = np.array(embedding)

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

    def retrieve_memories(self, query_embedding: List[float], k: int = 5) -> List[Dict]:
        """Retrieve relevant memories"""
        query_array = np.array(query_embedding)

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
                embedding=params['embedding'],
                metadata=params.get('metadata')
            )
        elif method == 'retrieve_memories':
            result = mcp.retrieve_memories(
                query_embedding=params['embedding'],
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
