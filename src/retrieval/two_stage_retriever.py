"""
Two-Stage Episodic Retrieval
============================

Human-inspired retrieval combining similarity-based and temporally-contiguous retrieval.
Mimics how humans recall episodes: semantic cues + temporal context.

References:
- EM-LLM (ICLR 2025): Two-stage memory retrieval
- Howard & Kahana (2002): Temporal context model
- Tulving & Thompson (1973): Encoding specificity principle

Stages:
1. Similarity-Based: Retrieve semantically related episodes
2. Temporal-Contiguous: Expand to temporally adjacent episodes
"""

import numpy as np
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from memory.episodic_store import Episode, EpisodicMemoryStore


@dataclass
class RetrievalConfig:
    """Configuration for two-stage retrieval."""
    # Stage 1: Similarity-based
    k_similarity: int = 20  # Number of similar episodes to retrieve
    similarity_threshold: float = 0.3  # Minimum similarity score
    
    # Stage 2: Temporal expansion
    temporal_window: int = 5  # Retrieve ±N temporally adjacent episodes
    enable_temporal_expansion: bool = True
    
    # Ranking
    similarity_weight: float = 0.6  # Weight for similarity score
    recency_weight: float = 0.2  # Weight for recency
    importance_weight: float = 0.2  # Weight for importance
    
    # Final selection
    max_retrieved: int = 10  # Maximum episodes to return


class TwoStageRetriever:
    """
    Two-stage episodic memory retrieval system.
    
    Stage 1: Similarity-Based Retrieval
    - Use vector similarity to find semantically related episodes
    - Filter by similarity threshold
    
    Stage 2: Temporal-Contiguous Retrieval
    - For each retrieved episode, also retrieve temporally adjacent episodes
    - Mimics human memory: recalling one event triggers nearby events
    
    Final Ranking:
    - Combine similarity, recency, and importance scores
    - Return top-k episodes
    """
    
    def __init__(
        self,
        memory_store: EpisodicMemoryStore,
        config: Optional[RetrievalConfig] = None
    ):
        """
        Args:
            memory_store: Episodic memory storage backend
            config: Retrieval configuration
        """
        self.memory = memory_store
        self.config = config or RetrievalConfig()
        
    def retrieve(
        self,
        query: np.ndarray,
        query_time: Optional[datetime] = None,
        filter_criteria: Optional[Dict] = None
    ) -> List[Tuple[Episode, float]]:
        """
        Two-stage episodic retrieval.
        
        Args:
            query: Query vector/embedding
            query_time: Time context for retrieval (defaults to now)
            filter_criteria: Optional filters (e.g., location, entities)
            
        Returns:
            List of (episode, score) tuples, sorted by relevance
        """
        query_time = query_time or datetime.now()
        
        # Stage 1: Similarity-based retrieval
        similar_episodes = self._stage1_similarity_retrieval(
            query, filter_criteria
        )
        
        if not similar_episodes:
            return []
        
        # Stage 2: Temporal-contiguous expansion
        if self.config.enable_temporal_expansion:
            all_episodes = self._stage2_temporal_expansion(similar_episodes)
        else:
            all_episodes = similar_episodes
        
        # Final ranking and selection
        ranked_episodes = self._final_ranking(
            all_episodes,
            query,
            query_time
        )
        
        return ranked_episodes[:self.config.max_retrieved]
    
    def _stage1_similarity_retrieval(
        self,
        query: np.ndarray,
        filter_criteria: Optional[Dict] = None
    ) -> List[Episode]:
        """
        Stage 1: Retrieve semantically similar episodes.
        
        Args:
            query: Query embedding
            filter_criteria: Optional filtering
            
        Returns:
            List of similar episodes
        """
        # Retrieve from vector database
        episodes = self.memory.retrieve_by_similarity(
            query_embedding=query,
            k=self.config.k_similarity,
            filter_criteria=filter_criteria
        )
        
        # Filter by similarity threshold
        filtered_episodes = []
        for episode in episodes:
            if episode.embedding is not None:
                similarity = self._cosine_similarity(query, episode.embedding)
                if similarity >= self.config.similarity_threshold:
                    filtered_episodes.append(episode)
        
        return filtered_episodes
    
    def _stage2_temporal_expansion(
        self,
        seed_episodes: List[Episode]
    ) -> List[Episode]:
        """
        Stage 2: Expand retrieval to temporally adjacent episodes.
        
        When humans recall an episode, temporally nearby episodes are also activated.
        This implements that effect.
        
        Args:
            seed_episodes: Episodes from stage 1
            
        Returns:
            Expanded episode set
        """
        # Use dict to track episodes by ID (Episodes not hashable)
        episodes_dict = {ep.episode_id: ep for ep in seed_episodes}
        window = self.config.temporal_window
        
        for episode in seed_episodes:
            # Define temporal window around this episode
            start_time = episode.timestamp - timedelta(minutes=window)
            end_time = episode.timestamp + timedelta(minutes=window)
            
            # Retrieve temporally adjacent episodes
            adjacent_episodes = self.memory.retrieve_by_temporal_range(
                start_time, end_time
            )
            
            for adj_ep in adjacent_episodes:
                episodes_dict[adj_ep.episode_id] = adj_ep
        
        return list(episodes_dict.values())
    
    def _final_ranking(
        self,
        episodes: List[Episode],
        query: np.ndarray,
        query_time: datetime
    ) -> List[Tuple[Episode, float]]:
        """
        Final ranking combining multiple factors.
        
        Score = w1*similarity + w2*recency + w3*importance
        
        Args:
            episodes: Episodes to rank
            query: Query vector
            query_time: Current time for recency calculation
            
        Returns:
            Ranked list of (episode, score) tuples
        """
        scored_episodes = []
        
        for episode in episodes:
            # 1. Similarity score
            if episode.embedding is not None:
                similarity = self._cosine_similarity(query, episode.embedding)
            else:
                similarity = 0.0
            
            # 2. Recency score (exponential decay)
            time_diff = (query_time - episode.timestamp).total_seconds()
            recency = np.exp(-time_diff / (24 * 3600))  # Decay over days
            
            # 3. Importance score (already normalized)
            importance = episode.importance
            
            # Combined score
            score = (
                self.config.similarity_weight * similarity +
                self.config.recency_weight * recency +
                self.config.importance_weight * importance
            )
            
            scored_episodes.append((episode, score))
        
        # Sort by score (descending)
        scored_episodes.sort(key=lambda x: x[1], reverse=True)
        
        return scored_episodes
    
    def _cosine_similarity(
        self,
        vec1: np.ndarray,
        vec2: np.ndarray
    ) -> float:
        """Compute cosine similarity between two vectors."""
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return dot_product / (norm1 * norm2)
    
    def retrieve_by_temporal_cue(
        self,
        time_description: str,
        k: int = 10
    ) -> List[Episode]:
        """
        Retrieve episodes based on temporal description.
        
        Args:
            time_description: e.g., "yesterday", "last week", "this morning"
            k: Number of episodes
            
        Returns:
            Retrieved episodes
        """
        # Parse temporal description (simplified)
        now = datetime.now()
        
        if "yesterday" in time_description.lower():
            start_time = now - timedelta(days=1)
            end_time = now - timedelta(days=1) + timedelta(hours=23, minutes=59)
        elif "last week" in time_description.lower():
            start_time = now - timedelta(weeks=1)
            end_time = now
        elif "this morning" in time_description.lower():
            start_time = now.replace(hour=6, minute=0, second=0)
            end_time = now.replace(hour=12, minute=0, second=0)
        else:
            # Default: last 24 hours
            start_time = now - timedelta(days=1)
            end_time = now
        
        episodes = self.memory.retrieve_by_temporal_range(start_time, end_time)
        
        # Sort by recency and return top-k
        episodes.sort(key=lambda ep: ep.timestamp, reverse=True)
        return episodes[:k]
    
    def retrieve_by_contextual_cue(
        self,
        location: Optional[str] = None,
        entities: Optional[List[str]] = None,
        k: int = 10
    ) -> List[Episode]:
        """
        Retrieve episodes by contextual cues (location, entities).
        
        Args:
            location: Spatial context
            entities: Entities involved
            k: Number of episodes
            
        Returns:
            Retrieved episodes
        """
        candidate_episodes = []
        
        if location:
            candidate_episodes.extend(
                self.memory.retrieve_by_location(location)
            )
        
        if entities:
            for entity in entities:
                candidate_episodes.extend(
                    self.memory.retrieve_by_entity(entity)
                )
        
        # Remove duplicates
        # Remove duplicates
        seen_ids = set()
        unique_episodes = []
        for ep in candidate_episodes:
            if ep.episode_id not in seen_ids:
                seen_ids.add(ep.episode_id)
                unique_episodes.append(ep)
        
        # Sort by importance
        unique_episodes.sort(key=lambda ep: ep.importance, reverse=True)
        
        return unique_episodes[:k]


if __name__ == "__main__":
    print("=== Two-Stage Retriever Test ===\n")
    
    # Import and setup memory store
    from memory.episodic_store import EpisodicMemoryStore, EpisodicMemoryConfig
    
    # Initialize
    memory_config = EpisodicMemoryConfig(embedding_dim=128)
    memory = EpisodicMemoryStore(memory_config)
    
    retriever = TwoStageRetriever(memory)
    
    # Create test episodes with temporal structure
    print("Creating test episodes...")
    base_time = datetime.now() - timedelta(hours=2)
    
    for i in range(30):
        content = np.random.randn(10)
        embedding = np.random.randn(128)
        embedding = embedding / np.linalg.norm(embedding)  # Normalize
        
        # Create temporal clusters
        if i < 10:
            timestamp = base_time + timedelta(minutes=i*2)
            location = "office"
            surprise = 0.3
        elif i < 20:
            timestamp = base_time + timedelta(minutes=30 + i*2)
            location = "cafe"
            surprise = 2.5  # High surprise cluster
        else:
            timestamp = base_time + timedelta(minutes=60 + i*2)
            location = "home"
            surprise = 0.5
        
        memory.store_episode(
            content=content,
            embedding=embedding,
            surprise=surprise,
            timestamp=timestamp,
            location=location,
            entities=[f"person_{i % 3}"]
        )
    
    print(f"Stored {memory.total_episodes_stored} episodes\n")
    
    # Test two-stage retrieval
    query = np.random.randn(128)
    query = query / np.linalg.norm(query)
    
    results = retriever.retrieve(query)
    
    print(f"Two-Stage Retrieval Results (top {len(results)}):")
    for i, (episode, score) in enumerate(results, 1):
        print(f"{i}. Score: {score:.3f}, Surprise: {episode.surprise:.2f}, "
              f"Location: {episode.location}, Time: {episode.timestamp.strftime('%H:%M')}")
    
    # Test temporal retrieval
    print("\n\nTemporal Retrieval Test:")
    temporal_results = retriever.retrieve_by_temporal_cue("last 2 hours")
    print(f"Episodes from 'last 2 hours': {len(temporal_results)}")
    
    # Test contextual retrieval
    print("\nContextual Retrieval Test:")
    cafe_results = retriever.retrieve_by_contextual_cue(location="cafe", k=5)
    print(f"Episodes at 'cafe': {len(cafe_results)}")
    
    print("\n✓ Two-stage retriever test complete!")
