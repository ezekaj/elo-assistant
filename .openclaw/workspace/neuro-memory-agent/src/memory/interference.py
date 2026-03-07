"""
Memory Interference Resolution
==============================

Handles proactive and retroactive interference between similar memories.
Implements pattern separation and completion mechanisms.

References:
- McClelland et al. (1995): Complementary learning systems
- Yassa & Stark (2011): Pattern separation in hippocampus
- Anderson & Neely (1996): Interference and inhibition in memory
"""

import numpy as np
from typing import List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class InterferenceConfig:
    """Configuration for interference resolution."""
    similarity_threshold: float = 0.85  # When memories interfere
    separation_strength: float = 0.3  # How much to orthogonalize
    min_pattern_distance: float = 0.2  # Minimum separation


class InterferenceResolver:
    """
    Resolves interference between similar memories.

    Two main mechanisms:
    1. Pattern Separation: Orthogonalize similar memories
    2. Pattern Completion: Reconstruct partial cues
    """

    def __init__(self, config: InterferenceConfig = None):
        self.config = config or InterferenceConfig()

    def detect_interference(
        self,
        new_embedding: np.ndarray,
        existing_embeddings: List[np.ndarray]
    ) -> List[int]:
        """
        Detect which existing memories interfere with new memory.

        Args:
            new_embedding: New memory embedding
            existing_embeddings: List of existing memory embeddings

        Returns:
            Indices of interfering memories
        """
        interfering_indices = []

        for i, existing in enumerate(existing_embeddings):
            similarity = self._cosine_similarity(new_embedding, existing)
            if similarity >= self.config.similarity_threshold:
                interfering_indices.append(i)

        return interfering_indices

    def apply_pattern_separation(
        self,
        new_embedding: np.ndarray,
        interfering_embedding: np.ndarray
    ) -> np.ndarray:
        """
        Apply pattern separation to reduce interference.

        Orthogonalizes new embedding away from interfering memory.

        Args:
            new_embedding: New memory to separate
            interfering_embedding: Interfering memory

        Returns:
            Separated embedding
        """
        # Project new onto interfering
        projection = np.dot(new_embedding, interfering_embedding) * interfering_embedding

        # Remove projection (orthogonalize)
        separated = new_embedding - self.config.separation_strength * projection

        # Normalize
        separated = separated / (np.linalg.norm(separated) + 1e-8)

        # Ensure minimum distance
        similarity = self._cosine_similarity(separated, interfering_embedding)
        if similarity > (1 - self.config.min_pattern_distance):
            # Add random noise to increase separation
            noise = np.random.randn(len(separated)) * 0.1
            separated = separated + noise
            separated = separated / (np.linalg.norm(separated) + 1e-8)

        return separated

    def pattern_complete(
        self,
        partial_cue: np.ndarray,
        stored_patterns: List[np.ndarray],
        threshold: float = 0.5
    ) -> Optional[np.ndarray]:
        """
        Complete partial memory cue using stored patterns.

        Args:
            partial_cue: Incomplete memory cue
            stored_patterns: Complete stored memories
            threshold: Minimum similarity to trigger completion

        Returns:
            Completed pattern or None
        """
        best_match = None
        best_similarity = threshold

        for pattern in stored_patterns:
            similarity = self._cosine_similarity(partial_cue, pattern)
            if similarity > best_similarity:
                best_similarity = similarity
                best_match = pattern

        return best_match

    def resolve_interference_set(
        self,
        new_embedding: np.ndarray,
        existing_embeddings: List[np.ndarray]
    ) -> Tuple[np.ndarray, List[np.ndarray]]:
        """
        Resolve interference for a new memory against existing set.

        Args:
            new_embedding: New memory
            existing_embeddings: Existing memories

        Returns:
            (separated_new, updated_existing)
        """
        # Detect interfering memories
        interfering_indices = self.detect_interference(new_embedding, existing_embeddings)

        if not interfering_indices:
            return new_embedding, existing_embeddings

        # Apply pattern separation
        separated_new = new_embedding.copy()
        for idx in interfering_indices:
            separated_new = self.apply_pattern_separation(
                separated_new,
                existing_embeddings[idx]
            )

        return separated_new, existing_embeddings

    def _cosine_similarity(
        self,
        vec1: np.ndarray,
        vec2: np.ndarray
    ) -> float:
        """Compute cosine similarity."""
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return dot_product / (norm1 * norm2)


if __name__ == "__main__":
    print("=== Interference Resolution Test ===\n")

    resolver = InterferenceResolver()

    # Create test memories
    np.random.seed(42)

    # Base memory
    memory1 = np.random.randn(128)
    memory1 = memory1 / np.linalg.norm(memory1)

    # Very similar memory (high interference)
    memory2 = memory1 + np.random.randn(128) * 0.1
    memory2 = memory2 / np.linalg.norm(memory2)

    # Dissimilar memory (no interference)
    memory3 = np.random.randn(128)
    memory3 = memory3 / np.linalg.norm(memory3)

    print("Memory similarities:")
    print(f"  memory1 vs memory2: {resolver._cosine_similarity(memory1, memory2):.3f} (interfering)")
    print(f"  memory1 vs memory3: {resolver._cosine_similarity(memory1, memory3):.3f} (separate)\n")

    # Detect interference
    existing = [memory1, memory3]
    interfering = resolver.detect_interference(memory2, existing)
    print(f"Interfering memories detected: {interfering}\n")

    # Apply pattern separation
    separated = resolver.apply_pattern_separation(memory2, memory1)
    print("After pattern separation:")
    print(f"  memory1 vs separated: {resolver._cosine_similarity(memory1, separated):.3f}")
    print(f"  memory2 vs separated: {resolver._cosine_similarity(memory2, separated):.3f}\n")

    # Test pattern completion
    partial = memory1 * 0.7 + np.random.randn(128) * 0.1
    partial = partial / np.linalg.norm(partial)
    completed = resolver.pattern_complete(partial, [memory1, memory3])

    if completed is not None:
        print("Pattern completion:")
        print(f"  Partial cue similarity to memory1: {resolver._cosine_similarity(partial, memory1):.3f}")
        print(f"  Completed pattern similarity to memory1: {resolver._cosine_similarity(completed, memory1):.3f}")

    print("\n✓ Interference resolution test complete!")
