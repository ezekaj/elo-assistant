"""
Episodic Memory Store
====================

Human-inspired episodic memory storage with temporal-spatial grounding.
Implements hybrid storage: vector database + disk offloading for massive contexts.

References:
- EM-LLM (ICLR 2025): Infinite context via episodic memory
- Tulving (1983): Episodic memory definition
- A-MEM (NeurIPS 2025): Agentic memory organization

Key Features:
1. Fast episodic encoding (single-shot learning)
2. Temporal-spatial indexing for contextual retrieval
3. Vector similarity search (ChromaDB/FAISS)
4. Disk offloading for contexts > 10M tokens
5. Automatic memory consolidation and pruning
"""

import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from datetime import datetime
import json
import pickle
from pathlib import Path
import chromadb
from chromadb.config import Settings


@dataclass
class Episode:
    """
    Single episodic memory representing a specific event.
    
    Attributes:
        content: The actual observation/experience
        timestamp: When the episode occurred
        location: Spatial context (optional)
        entities: Who/what was involved
        embedding: Vector representation for similarity search
        surprise: How novel/unexpected this episode was
        importance: Consolidation priority score
        metadata: Additional contextual information
    """
    content: np.ndarray
    timestamp: datetime
    location: Optional[str] = None
    entities: List[str] = field(default_factory=list)
    embedding: Optional[np.ndarray] = None
    surprise: float = 0.0
    importance: float = 0.5
    metadata: Dict[str, Any] = field(default_factory=dict)
    episode_id: Optional[str] = None
    
    def __post_init__(self):
        """Generate episode ID if not provided."""
        if self.episode_id is None:
            self.episode_id = f"ep_{self.timestamp.timestamp()}_{id(self)}"
    
    def to_dict(self) -> Dict:
        """Convert episode to dictionary for serialization."""
        return {
            "episode_id": self.episode_id,
            "content": self.content.tolist() if isinstance(self.content, np.ndarray) else self.content,
            "timestamp": self.timestamp.isoformat(),
            "location": self.location,
            "entities": self.entities,
            "embedding": self.embedding.tolist() if self.embedding is not None else None,
            "surprise": self.surprise,
            "importance": self.importance,
            "metadata": self.metadata
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'Episode':
        """Reconstruct episode from dictionary."""
        return cls(
            content=np.array(data["content"]),
            timestamp=datetime.fromisoformat(data["timestamp"]),
            location=data.get("location"),
            entities=data.get("entities", []),
            embedding=np.array(data["embedding"]) if data.get("embedding") else None,
            surprise=data.get("surprise", 0.0),
            importance=data.get("importance", 0.5),
            metadata=data.get("metadata", {}),
            episode_id=data.get("episode_id")
        )


@dataclass
class EpisodicMemoryConfig:
    """Configuration for episodic memory storage."""
    max_episodes: int = 10000  # Maximum episodes in hot storage
    embedding_dim: int = 512  # Dimension of episode embeddings
    enable_disk_offload: bool = True  # Offload old episodes to disk
    offload_threshold: int = 8000  # Start offloading when this many episodes
    importance_decay: float = 0.99  # Decay factor for episode importance
    consolidation_interval: int = 100  # Consolidate every N new episodes
    vector_db_backend: str = "chromadb"  # "chromadb" or "faiss"
    persistence_path: Optional[str] = "./memory_store"  # Path for persistent storage


class EpisodicMemoryStore:
    """
    Episodic memory storage with efficient retrieval and consolidation.
    
    Mimics hippocampal episodic memory:
    - Fast single-shot encoding
    - Temporal-spatial indexing
    - Importance-based consolidation
    - Automatic capacity management
    """
    
    def __init__(self, config: Optional[EpisodicMemoryConfig] = None):
        """
        Args:
            config: Memory configuration
        """
        self.config = config or EpisodicMemoryConfig()
        
        # In-memory episode storage (hot storage)
        self.episodes: List[Episode] = []
        
        # Temporal index: timestamp -> episode_ids
        self.temporal_index: Dict[str, List[str]] = {}
        
        # Spatial index: location -> episode_ids
        self.spatial_index: Dict[str, List[str]] = {}
        
        # Entity index: entity -> episode_ids
        self.entity_index: Dict[str, List[str]] = {}
        
        # Statistics
        self.total_episodes_stored = 0
        self.episodes_offloaded = 0
        
        # Initialize vector database
        self._initialize_vector_db()
        
        # Setup persistence
        if self.config.persistence_path:
            self.persistence_path = Path(self.config.persistence_path)
            self.persistence_path.mkdir(parents=True, exist_ok=True)
        
    def _initialize_vector_db(self):
        """Initialize vector database for similarity search."""
        if self.config.vector_db_backend == "chromadb":
            # Initialize ChromaDB
            if self.config.persistence_path:
                self.chroma_client = chromadb.Client(Settings(
                    persist_directory=str(Path(self.config.persistence_path) / "chroma"),
                    anonymized_telemetry=False
                ))
            else:
                self.chroma_client = chromadb.Client()
            
            # Create or get collection
            self.collection = self.chroma_client.get_or_create_collection(
                name="episodic_memories",
                metadata={"description": "Human-inspired episodic memory storage"}
            )
        else:
            # FAISS initialization (future implementation)
            raise NotImplementedError("FAISS backend not yet implemented")
    
    def store_episode(
        self,
        content: np.ndarray,
        surprise: float = 0.0,
        timestamp: Optional[datetime] = None,
        location: Optional[str] = None,
        entities: Optional[List[str]] = None,
        metadata: Optional[Dict] = None,
        embedding: Optional[np.ndarray] = None
    ) -> Episode:
        """
        Store a new episodic memory (single-shot learning).
        
        Args:
            content: Observation content
            surprise: Surprise/novelty score from BayesianSurpriseEngine
            timestamp: When this happened (defaults to now)
            location: Where this happened
            entities: Who/what was involved
            metadata: Additional context
            embedding: Pre-computed embedding (optional)
            
        Returns:
            Created Episode object
        """
        # Create episode
        episode = Episode(
            content=content,
            timestamp=timestamp or datetime.now(),
            location=location,
            entities=entities or [],
            embedding=embedding,
            surprise=surprise,
            importance=self._compute_importance(surprise),
            metadata=metadata or {}
        )
        
        # Generate embedding if not provided
        if episode.embedding is None:
            episode.embedding = self._generate_embedding(content)
        
        # Add to in-memory storage
        self.episodes.append(episode)
        
        # Update indices
        self._update_indices(episode)
        
        # Add to vector database
        self._add_to_vector_db(episode)
        
        # Update statistics
        self.total_episodes_stored += 1
        
        # Check if consolidation/offloading needed
        if len(self.episodes) >= self.config.offload_threshold:
            self._consolidate_memory()
        
        return episode
    
    def _compute_importance(self, surprise: float) -> float:
        """
        Compute importance score for episode.
        Higher surprise → higher importance → prioritized for consolidation.
        
        Args:
            surprise: Surprise value from Bayesian surprise engine
            
        Returns:
            Importance score [0, 1]
        """
        # Sigmoid transformation of surprise
        importance = 1.0 / (1.0 + np.exp(-surprise + 2.0))
        return np.clip(importance, 0.0, 1.0)
    
    def _generate_embedding(self, content: np.ndarray) -> np.ndarray:
        """
        Generate vector embedding for content.
        In production, use a pre-trained encoder (e.g., BERT, Sentence Transformers).
        
        Args:
            content: Observation content
            
        Returns:
            Embedding vector
        """
        # Simple projection for now (replace with real encoder)
        if len(content) < self.config.embedding_dim:
            # Pad with zeros
            embedding = np.zeros(self.config.embedding_dim)
            embedding[:len(content)] = content
        else:
            # Use PCA-like projection (simplified)
            embedding = content[:self.config.embedding_dim]
        
        # Normalize
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm
        
        return embedding
    
    def _update_indices(self, episode: Episode):
        """Update all indices with new episode."""
        # Temporal index (by date)
        date_key = episode.timestamp.strftime("%Y-%m-%d")
        if date_key not in self.temporal_index:
            self.temporal_index[date_key] = []
        self.temporal_index[date_key].append(episode.episode_id)
        
        # Spatial index
        if episode.location:
            if episode.location not in self.spatial_index:
                self.spatial_index[episode.location] = []
            self.spatial_index[episode.location].append(episode.episode_id)
        
        # Entity index
        for entity in episode.entities:
            if entity not in self.entity_index:
                self.entity_index[entity] = []
            self.entity_index[entity].append(episode.episode_id)
    
    def _add_to_vector_db(self, episode: Episode):
        """Add episode to vector database for similarity search."""
        if self.config.vector_db_backend == "chromadb":
            self.collection.add(
                ids=[episode.episode_id],
                embeddings=[episode.embedding.tolist()],
                metadatas=[{
                    "timestamp": episode.timestamp.isoformat(),
                    "location": episode.location or "",
                    "entities": ",".join(episode.entities),
                    "surprise": episode.surprise,
                    "importance": episode.importance
                }]
            )
    
    def retrieve_by_similarity(
        self,
        query_embedding: np.ndarray,
        k: int = 10,
        filter_criteria: Optional[Dict] = None
    ) -> List[Episode]:
        """
        Retrieve k most similar episodes by vector similarity.
        
        Args:
            query_embedding: Query vector
            k: Number of episodes to retrieve
            filter_criteria: Optional filters (e.g., {"location": "office"})
            
        Returns:
            List of similar episodes
        """
        # Query vector database
        where_clause = None
        if filter_criteria:
            where_clause = filter_criteria
        
        results = self.collection.query(
            query_embeddings=[query_embedding.tolist()],
            n_results=k,
            where=where_clause
        )
        
        # Retrieve full episodes
        episode_ids = results['ids'][0] if results['ids'] else []
        episodes = [self._get_episode_by_id(eid) for eid in episode_ids]
        
        return [ep for ep in episodes if ep is not None]
    
    def retrieve_by_temporal_range(
        self,
        start_time: datetime,
        end_time: datetime
    ) -> List[Episode]:
        """
        Retrieve episodes within a time range.
        
        Args:
            start_time: Start of time window
            end_time: End of time window
            
        Returns:
            Episodes in time range
        """
        matching_episodes = []
        
        for episode in self.episodes:
            if start_time <= episode.timestamp <= end_time:
                matching_episodes.append(episode)
        
        return matching_episodes
    
    def retrieve_by_location(self, location: str) -> List[Episode]:
        """Retrieve all episodes at a specific location."""
        episode_ids = self.spatial_index.get(location, [])
        episodes = [self._get_episode_by_id(eid) for eid in episode_ids]
        return [ep for ep in episodes if ep is not None]
    
    def retrieve_by_entity(self, entity: str) -> List[Episode]:
        """Retrieve all episodes involving a specific entity."""
        episode_ids = self.entity_index.get(entity, [])
        episodes = [self._get_episode_by_id(eid) for eid in episode_ids]
        return [ep for ep in episodes if ep is not None]
    
    def _get_episode_by_id(self, episode_id: str) -> Optional[Episode]:
        """Retrieve episode by ID."""
        for episode in self.episodes:
            if episode.episode_id == episode_id:
                return episode
        
        # Check offloaded storage
        if self.config.enable_disk_offload:
            return self._load_offloaded_episode(episode_id)
        
        return None
    
    def _consolidate_memory(self):
        """
        Consolidate memory by offloading low-importance episodes to disk.
        Mimics hippocampal consolidation: important memories stay, others archived.
        """
        if not self.config.enable_disk_offload:
            return
        
        # Decay importance of all episodes
        for episode in self.episodes:
            episode.importance *= self.config.importance_decay
        
        # Sort by importance
        self.episodes.sort(key=lambda ep: ep.importance, reverse=True)
        
        # Offload bottom X% to disk
        n_to_offload = len(self.episodes) - self.config.max_episodes
        if n_to_offload > 0:
            episodes_to_offload = self.episodes[-n_to_offload:]
            self.episodes = self.episodes[:-n_to_offload]
            
            for episode in episodes_to_offload:
                self._offload_episode(episode)
                self.episodes_offloaded += 1
    
    def _offload_episode(self, episode: Episode):
        """Offload episode to disk storage."""
        if not self.persistence_path:
            return
        
        offload_dir = self.persistence_path / "offloaded"
        offload_dir.mkdir(exist_ok=True)
        
        file_path = offload_dir / f"{episode.episode_id}.pkl"
        with open(file_path, 'wb') as f:
            pickle.dump(episode, f)
    
    def _load_offloaded_episode(self, episode_id: str) -> Optional[Episode]:
        """Load episode from disk storage."""
        if not self.persistence_path:
            return None
        
        file_path = self.persistence_path / "offloaded" / f"{episode_id}.pkl"
        if file_path.exists():
            with open(file_path, 'rb') as f:
                return pickle.load(f)
        
        return None
    
    def save_state(self):
        """Save memory state to disk."""
        if not self.persistence_path:
            return
        
        state = {
            "config": self.config.__dict__,
            "episodes": [ep.to_dict() for ep in self.episodes],
            "temporal_index": self.temporal_index,
            "spatial_index": self.spatial_index,
            "entity_index": self.entity_index,
            "total_episodes_stored": self.total_episodes_stored,
            "episodes_offloaded": self.episodes_offloaded
        }
        
        state_file = self.persistence_path / "memory_state.json"
        with open(state_file, 'w') as f:
            json.dump(state, f, indent=2)
    
    def load_state(self):
        """Load memory state from disk."""
        if not self.persistence_path:
            return
        
        state_file = self.persistence_path / "memory_state.json"
        if not state_file.exists():
            return
        
        with open(state_file, 'r') as f:
            state = json.load(f)
        
        # Restore episodes
        self.episodes = [Episode.from_dict(ep_dict) for ep_dict in state["episodes"]]
        
        # Restore indices
        self.temporal_index = state["temporal_index"]
        self.spatial_index = state["spatial_index"]
        self.entity_index = state["entity_index"]
        
        # Restore statistics
        self.total_episodes_stored = state["total_episodes_stored"]
        self.episodes_offloaded = state["episodes_offloaded"]
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get memory statistics."""
        return {
            "total_episodes": self.total_episodes_stored,
            "episodes_in_memory": len(self.episodes),
            "episodes_offloaded": self.episodes_offloaded,
            "unique_locations": len(self.spatial_index),
            "unique_entities": len(self.entity_index),
            "temporal_span_days": len(self.temporal_index),
            "mean_importance": np.mean([ep.importance for ep in self.episodes]) if self.episodes else 0.0
        }


if __name__ == "__main__":
    print("=== Episodic Memory Store Test ===\n")
    
    # Initialize memory store
    config = EpisodicMemoryConfig(max_episodes=100, embedding_dim=128)
    memory = EpisodicMemoryStore(config)
    
    # Store some episodes
    print("Storing episodes...")
    for i in range(50):
        content = np.random.randn(10)
        surprise = np.random.rand() * 3.0  # Random surprise
        location = ["office", "home", "cafe"][i % 3]
        entities = [f"person_{i % 5}"]
        
        episode = memory.store_episode(
            content=content,
            surprise=surprise,
            location=location,
            entities=entities,
            metadata={"event": f"test_event_{i}"}
        )
    
    # Retrieve statistics
    stats = memory.get_statistics()
    print(f"\nMemory Statistics:")
    for key, value in stats.items():
        print(f"  {key}: {value}")
    
    # Test similarity retrieval
    query = np.random.randn(128)
    similar_episodes = memory.retrieve_by_similarity(query, k=5)
    print(f"\nRetrieved {len(similar_episodes)} similar episodes")
    
    # Test location retrieval
    office_episodes = memory.retrieve_by_location("office")
    print(f"Episodes at 'office': {len(office_episodes)}")
    
    # Test entity retrieval
    person_0_episodes = memory.retrieve_by_entity("person_0")
    print(f"Episodes with 'person_0': {len(person_0_episodes)}")
    
    print("\n✓ Episodic memory store test complete!")
