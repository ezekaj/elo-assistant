"""
Complete Neuro-Memory-Agent Demo
================================

Demonstrates the full pipeline:
1. Bayesian Surprise → Detect novel events
2. Event Segmentation → Chunk into episodes
3. Episodic Storage → Store with context
4. Two-Stage Retrieval → Human-like recall

Simulates a day in the life of an AI agent with episodic memory.
"""

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

import numpy as np
from datetime import datetime, timedelta

from src.surprise import BayesianSurpriseEngine, SurpriseConfig
from src.segmentation import EventSegmenter, SegmentationConfig
from src.memory import EpisodicMemoryStore, EpisodicMemoryConfig
from src.retrieval import TwoStageRetriever, RetrievalConfig


def generate_synthetic_day():
    """
    Generate synthetic sequence representing a day's activities.
    
    Events:
    - Morning: Office work (routine, low surprise)
    - Noon: Important meeting (high surprise)
    - Afternoon: Back to routine
    - Evening: Unexpected visitor (high surprise)
    """
    np.random.seed(42)
    
    # Morning: Routine office work (low variance)
    morning = np.random.randn(60, 128) * 0.3 + np.array([1.0] * 128)
    
    # Noon: Important meeting (sudden shift, high surprise)
    meeting = np.random.randn(30, 128) * 0.5 + np.array([5.0] * 128)
    
    # Afternoon: Back to routine
    afternoon = np.random.randn(50, 128) * 0.3 + np.array([1.0] * 128)
    
    # Evening: Unexpected visitor (different pattern)
    evening = np.random.randn(40, 128) * 0.8 - np.array([2.0] * 128)
    
    # Concatenate
    sequence = np.vstack([morning, meeting, afternoon, evening])
    
    # Ground truth boundaries
    true_boundaries = [60, 90, 140]
    
    # Timestamps
    base_time = datetime.now().replace(hour=9, minute=0, second=0, microsecond=0)
    timestamps = [base_time + timedelta(minutes=i*5) for i in range(len(sequence))]
    
    # Locations
    locations = (
        ["office"] * 60 +
        ["conference_room"] * 30 +
        ["office"] * 50 +
        ["home"] * 40
    )
    
    # Entities
    entities_list = (
        [["self"]] * 60 +
        [["self", "Alice", "Bob"]] * 30 +
        [["self"]] * 50 +
        [["self", "Charlie"]] * 40
    )
    
    return {
        "sequence": sequence,
        "timestamps": timestamps,
        "locations": locations,
        "entities": entities_list,
        "true_boundaries": true_boundaries
    }


def main():
    print("=" * 70)
    print(" NEURO-MEMORY-AGENT: Complete System Demo")
    print("=" * 70)
    print()
    
    # Generate synthetic day
    print("📅 Generating synthetic day (180 observations, ~15 hours)...")
    data = generate_synthetic_day()
    sequence = data["sequence"]
    print(f"   Sequence shape: {sequence.shape}")
    print(f"   Time span: {data['timestamps'][0]} to {data['timestamps'][-1]}")
    print(f"   True event boundaries: {data['true_boundaries']}")
    print()
    
    # ============================================================
    # STEP 1: Bayesian Surprise Detection
    # ============================================================
    print("🔍 STEP 1: Bayesian Surprise Detection")
    print("-" * 70)
    
    surprise_config = SurpriseConfig(
        window_size=30,
        surprise_threshold=0.7,
        use_adaptive_threshold=True
    )
    
    surprise_engine = BayesianSurpriseEngine(
        input_dim=sequence.shape[1],
        config=surprise_config
    )
    
    print("   Processing sequence...")
    surprise_results = surprise_engine.process_sequence([obs for obs in sequence])
    
    surprise_values = [r["surprise"] for r in surprise_results]
    novelty_flags = [r["is_novel"] for r in surprise_results]
    
    print(f"   ✓ Mean surprise: {surprise_engine.mean_surprise:.4f}")
    print(f"   ✓ Novel events detected: {sum(novelty_flags)}/{len(novelty_flags)}")
    print(f"   ✓ Top surprise peaks at indices: {sorted(np.argsort(surprise_values)[-5:])}")
    print()
    
    # ============================================================
    # STEP 2: Event Segmentation
    # ============================================================
    print("📊 STEP 2: Event Segmentation")
    print("-" * 70)
    
    seg_config = SegmentationConfig(
        min_event_length=10,
        boundary_refinement=True,
        state_detection_method="hybrid"
    )
    
    segmenter = EventSegmenter(config=seg_config)
    
    print("   Segmenting sequence...")
    segmentation = segmenter.segment(
        observations=sequence,
        surprise_values=np.array(surprise_values)
    )
    
    detected_boundaries = segmentation["boundaries"]
    events = segmentation["events"]
    
    print(f"   ✓ Detected {segmentation['n_events']} events")
    print(f"   ✓ Boundaries: {detected_boundaries}")
    print(f"   ✓ Ground truth: {data['true_boundaries']}")
    
    # Evaluate boundary detection accuracy
    def evaluate_boundaries(detected, true, tolerance=5):
        matches = 0
        for true_b in true:
            if any(abs(det_b - true_b) <= tolerance for det_b in detected):
                matches += 1
        precision = matches / len(detected) if detected else 0
        recall = matches / len(true) if true else 0
        return precision, recall
    
    precision, recall = evaluate_boundaries(detected_boundaries, data['true_boundaries'])
    print(f"   ✓ Boundary detection - Precision: {precision:.2f}, Recall: {recall:.2f}")
    print()
    
    # ============================================================
    # STEP 3: Episodic Memory Storage
    # ============================================================
    print("💾 STEP 3: Episodic Memory Storage")
    print("-" * 70)
    
    memory_config = EpisodicMemoryConfig(
        max_episodes=100,
        embedding_dim=128,
        enable_disk_offload=True
    )
    
    memory = EpisodicMemoryStore(config=memory_config)
    
    print("   Storing events as episodes...")
    
    # Store each event segment as an episode
    boundaries_with_ends = [0] + detected_boundaries + [len(sequence)]
    
    for i in range(len(boundaries_with_ends) - 1):
        start_idx = boundaries_with_ends[i]
        end_idx = boundaries_with_ends[i + 1]
        
        # Event summary (mean of observations)
        event_content = sequence[start_idx:end_idx].mean(axis=0)
        
        # Event metadata
        event_surprise = np.mean(surprise_values[start_idx:end_idx])
        event_timestamp = data['timestamps'][start_idx]
        event_location = data['locations'][start_idx]
        event_entities = data['entities'][start_idx]
        
        # Store episode
        memory.store_episode(
            content=event_content,
            surprise=event_surprise,
            timestamp=event_timestamp,
            location=event_location,
            entities=event_entities,
            metadata={
                "event_id": i,
                "start_idx": start_idx,
                "end_idx": end_idx,
                "duration_minutes": (end_idx - start_idx) * 5
            }
        )
    
    stats = memory.get_statistics()
    print(f"   ✓ Episodes stored: {stats['total_episodes']}")
    print(f"   ✓ Unique locations: {stats['unique_locations']}")
    print(f"   ✓ Unique entities: {stats['unique_entities']}")
    print(f"   ✓ Mean importance: {stats['mean_importance']:.3f}")
    print()
    
    # ============================================================
    # STEP 4: Two-Stage Retrieval
    # ============================================================
    print("🔎 STEP 4: Two-Stage Episodic Retrieval")
    print("-" * 70)
    
    retrieval_config = RetrievalConfig(
        k_similarity=10,
        enable_temporal_expansion=True,
        temporal_window=15,  # ±15 minutes
        max_retrieved=5
    )
    
    retriever = TwoStageRetriever(
        memory_store=memory,
        config=retrieval_config
    )
    
    # Query 1: Find episodes similar to "meeting" pattern
    print("   Query 1: Find episodes similar to meeting pattern")
    meeting_query = sequence[60:90].mean(axis=0)  # Use actual meeting data
    meeting_query = meeting_query / np.linalg.norm(meeting_query)
    
    results1 = retriever.retrieve(meeting_query)
    
    for rank, (episode, score) in enumerate(results1, 1):
        print(f"     {rank}. Score: {score:.3f} | Surprise: {episode.surprise:.2f} | "
              f"Location: {episode.location} | Time: {episode.timestamp.strftime('%H:%M')} | "
              f"Entities: {episode.entities}")
    print()
    
    # Query 2: Temporal retrieval - "What happened this morning?"
    print("   Query 2: What happened this morning?")
    morning_episodes = retriever.retrieve_by_temporal_cue("this morning", k=3)
    
    for rank, episode in enumerate(morning_episodes, 1):
        print(f"     {rank}. Time: {episode.timestamp.strftime('%H:%M')} | "
              f"Location: {episode.location} | Surprise: {episode.surprise:.2f}")
    print()
    
    # Query 3: Contextual retrieval - "Episodes in conference room"
    print("   Query 3: Episodes in conference room")
    conf_episodes = retriever.retrieve_by_contextual_cue(
        location="conference_room",
        k=5
    )
    
    for rank, episode in enumerate(conf_episodes, 1):
        print(f"     {rank}. Time: {episode.timestamp.strftime('%H:%M')} | "
              f"Surprise: {episode.surprise:.2f} | Entities: {episode.entities}")
    print()
    
    # Query 4: Entity-based - "Episodes with Alice"
    print("   Query 4: Episodes with Alice")
    alice_episodes = retriever.retrieve_by_contextual_cue(
        entities=["Alice"],
        k=5
    )
    
    for rank, episode in enumerate(alice_episodes, 1):
        print(f"     {rank}. Time: {episode.timestamp.strftime('%H:%M')} | "
              f"Location: {episode.location} | Surprise: {episode.surprise:.2f}")
    print()
    
    # ============================================================
    # SUMMARY
    # ============================================================
    print("=" * 70)
    print(" 🎉 Demo Complete!")
    print("=" * 70)
    print()
    print("Key Achievements:")
    print(f"  ✅ Detected {sum(novelty_flags)} novel events from {len(sequence)} observations")
    print(f"  ✅ Segmented into {segmentation['n_events']} coherent episodes")
    print(f"  ✅ Stored {stats['total_episodes']} episodes with full context")
    print(f"  ✅ Retrieved relevant episodes using multiple query modes")
    print()
    print("System Capabilities Demonstrated:")
    print("  • Bayesian surprise-driven novelty detection")
    print("  • HMM + graph-theoretic event segmentation")
    print("  • Fast single-shot episodic encoding")
    print("  • Temporal-spatial-entity indexing")
    print("  • Two-stage retrieval (similarity + temporal)")
    print("  • Human-like memory consolidation")
    print()
    print("Next Steps:")
    print("  1. Integrate with your LLM agent")
    print("  2. Use real embeddings (e.g., Sentence Transformers)")
    print("  3. Scale to 10M+ token contexts")
    print("  4. Add memory visualization tools")
    print()
    print("=" * 70)


if __name__ == "__main__":
    main()
