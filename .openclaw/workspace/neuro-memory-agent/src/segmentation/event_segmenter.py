"""
Event Segmentation Module
=========================

Implements online event segmentation using prediction error and state transition detection.
Combines Bayesian surprise with Hidden Markov Model (HMM) approaches for robust event boundary detection.

References:
- Baldassano et al. (2017): "Discovering Event Structure in Continuous Narrative Perception"
- Zacks et al. (2007): Event Segmentation Theory
- GSBS (Greedy State Boundary Search) algorithm
- EM-LLM: Graph-theoretic boundary refinement

Key Algorithms:
1. Prediction Error: Detect boundaries where model predictions fail
2. State Transition: HMM-based state change detection
3. Graph Modularity: Optimize event boundaries for within-event coherence
"""

import numpy as np
from typing import List, Optional, Tuple, Dict
from dataclasses import dataclass
from collections import deque
import networkx as nx
from scipy.stats import norm
from sklearn.cluster import AgglomerativeClustering


@dataclass
class SegmentationConfig:
    """Configuration for event segmentation."""
    min_event_length: int = 5  # Minimum observations per event
    max_event_length: int = 100  # Maximum observations per event
    boundary_refinement: bool = True  # Use graph-theoretic refinement
    modularity_metric: str = "modularity"  # "modularity" or "conductance"
    state_detection_method: str = "hmm"  # "hmm", "prediction_error", or "hybrid"
    prediction_error_threshold: float = 2.0  # Z-score threshold for prediction error
    

class HiddenMarkovEventDetector:
    """
    Hidden Markov Model-based event detection.
    Detects event boundaries as transitions between stable hidden states.
    """
    
    def __init__(self, n_states: int = 10, window_size: int = 20):
        """
        Args:
            n_states: Number of hidden states
            window_size: Window size for state estimation
        """
        self.n_states = n_states
        self.window_size = window_size
        self.state_sequence = []
        
    def segment_sequence(
        self,
        observations: np.ndarray
    ) -> List[int]:
        """
        Segment sequence using HMM state transitions.
        
        Args:
            observations: Array of shape [n_timesteps, n_features]
            
        Returns:
            List of boundary indices
        """
        from hmmlearn import hmm
        
        # Train Gaussian HMM
        model = hmm.GaussianHMM(
            n_components=self.n_states,
            covariance_type="diag",
            n_iter=100
        )
        
        try:
            model.fit(observations)
            
            # Predict state sequence
            states = model.predict(observations)
            self.state_sequence = states
            
            # Find state transitions
            boundaries = []
            for i in range(1, len(states)):
                if states[i] != states[i-1]:
                    boundaries.append(i)
            
            return boundaries
            
        except Exception as e:
            print(f"HMM fitting failed: {e}")
            # Fallback to simple clustering
            return self._fallback_clustering(observations)
    
    def _fallback_clustering(self, observations: np.ndarray) -> List[int]:
        """Fallback method using hierarchical clustering."""
        clustering = AgglomerativeClustering(
            n_clusters=min(self.n_states, len(observations) // 10)
        )
        labels = clustering.fit_predict(observations)
        
        boundaries = []
        for i in range(1, len(labels)):
            if labels[i] != labels[i-1]:
                boundaries.append(i)
        
        return boundaries


class PredictionErrorDetector:
    """
    Detect event boundaries using prediction error signals.
    Boundaries occur where current observations deviate from predictions.
    """
    
    def __init__(self, threshold: float = 2.0, window_size: int = 10):
        """
        Args:
            threshold: Z-score threshold for boundary detection
            window_size: Window for computing prediction error statistics
        """
        self.threshold = threshold
        self.window_size = window_size
        
    def compute_prediction_error(
        self,
        observations: np.ndarray,
        predictions: np.ndarray
    ) -> np.ndarray:
        """
        Compute prediction error at each timestep.
        
        Args:
            observations: Actual observations [n_timesteps, n_features]
            predictions: Predicted observations [n_timesteps, n_features]
            
        Returns:
            Prediction errors [n_timesteps]
        """
        # Euclidean distance between observation and prediction
        errors = np.linalg.norm(observations - predictions, axis=1)
        return errors
    
    def detect_boundaries(
        self,
        prediction_errors: np.ndarray
    ) -> List[int]:
        """
        Detect boundaries from prediction error signal.
        
        Args:
            prediction_errors: Array of prediction errors [n_timesteps]
            
        Returns:
            List of boundary indices
        """
        # Normalize errors to Z-scores
        mean_error = np.mean(prediction_errors)
        std_error = np.std(prediction_errors) + 1e-8
        z_scores = (prediction_errors - mean_error) / std_error
        
        # Find peaks above threshold
        boundaries = []
        for i in range(1, len(z_scores) - 1):
            # Local maximum above threshold
            if (z_scores[i] > self.threshold and
                z_scores[i] > z_scores[i-1] and
                z_scores[i] > z_scores[i+1]):
                boundaries.append(i)
        
        return boundaries


class GraphBoundaryRefiner:
    """
    Refine event boundaries using graph-theoretic modularity optimization.
    Events should have high internal coherence and low between-event connectivity.
    """
    
    def __init__(self, metric: str = "modularity"):
        """
        Args:
            metric: "modularity" or "conductance"
        """
        self.metric = metric
        
    def build_similarity_graph(
        self,
        observations: np.ndarray,
        k_neighbors: int = 5
    ) -> nx.Graph:
        """
        Build k-NN similarity graph from observations.
        
        Args:
            observations: Array of shape [n_timesteps, n_features]
            k_neighbors: Number of nearest neighbors
            
        Returns:
            NetworkX graph
        """
        n = len(observations)
        G = nx.Graph()
        G.add_nodes_from(range(n))
        
        # Compute pairwise similarities (cosine similarity)
        from sklearn.metrics.pairwise import cosine_similarity
        similarity_matrix = cosine_similarity(observations)
        
        # Add edges to k nearest neighbors
        for i in range(n):
            # Get k nearest neighbors (excluding self)
            neighbors = np.argsort(similarity_matrix[i])[::-1][1:k_neighbors+1]
            for j in neighbors:
                weight = similarity_matrix[i, j]
                G.add_edge(i, j, weight=weight)
        
        return G
    
    def compute_modularity(
        self,
        graph: nx.Graph,
        boundaries: List[int]
    ) -> float:
        """
        Compute modularity of event segmentation.
        
        Args:
            graph: Similarity graph
            boundaries: Event boundaries
            
        Returns:
            Modularity score (higher is better)
        """
        # Create community assignment from boundaries
        communities = self._boundaries_to_communities(len(graph.nodes), boundaries)
        
        # Compute modularity
        from networkx.algorithms.community import modularity
        
        # Convert to list of sets (community structure)
        community_sets = []
        for community_id in set(communities):
            nodes = {i for i, c in enumerate(communities) if c == community_id}
            community_sets.append(nodes)
        
        return modularity(graph, community_sets)
    
    def compute_conductance(
        self,
        graph: nx.Graph,
        boundaries: List[int]
    ) -> float:
        """
        Compute conductance (lower is better for good segmentation).
        
        Args:
            graph: Similarity graph
            boundaries: Event boundaries
            
        Returns:
            Average conductance
        """
        communities = self._boundaries_to_communities(len(graph.nodes), boundaries)
        
        conductances = []
        for community_id in set(communities):
            nodes = [i for i, c in enumerate(communities) if c == community_id]
            if len(nodes) > 0:
                subgraph = graph.subgraph(nodes)
                # Conductance = external edges / min(internal, external)
                internal_edges = subgraph.number_of_edges()
                external_edges = sum(1 for n in nodes 
                                   for neighbor in graph.neighbors(n) 
                                   if neighbor not in nodes)
                
                if internal_edges + external_edges > 0:
                    cond = external_edges / (internal_edges + external_edges)
                    conductances.append(cond)
        
        return np.mean(conductances) if conductances else 1.0
    
    def refine_boundaries(
        self,
        observations: np.ndarray,
        initial_boundaries: List[int],
        max_iterations: int = 10
    ) -> List[int]:
        """
        Refine boundaries to optimize graph modularity.
        
        Args:
            observations: Array of shape [n_timesteps, n_features]
            initial_boundaries: Initial boundary estimates
            max_iterations: Maximum refinement iterations
            
        Returns:
            Refined boundaries
        """
        graph = self.build_similarity_graph(observations, k_neighbors=5)
        
        current_boundaries = sorted(initial_boundaries)
        best_boundaries = current_boundaries.copy()
        
        if self.metric == "modularity":
            best_score = self.compute_modularity(graph, current_boundaries)
            maximize = True
        else:  # conductance
            best_score = self.compute_conductance(graph, current_boundaries)
            maximize = False
        
        for iteration in range(max_iterations):
            improved = False
            
            # Try small adjustments to each boundary
            for i, boundary in enumerate(current_boundaries):
                for delta in [-2, -1, 1, 2]:
                    new_boundary = boundary + delta
                    
                    # Check validity
                    if new_boundary < 1 or new_boundary >= len(observations):
                        continue
                    
                    # Create test boundaries
                    test_boundaries = current_boundaries.copy()
                    test_boundaries[i] = new_boundary
                    test_boundaries = sorted(test_boundaries)
                    
                    # Evaluate
                    if self.metric == "modularity":
                        score = self.compute_modularity(graph, test_boundaries)
                        is_better = score > best_score
                    else:
                        score = self.compute_conductance(graph, test_boundaries)
                        is_better = score < best_score
                    
                    if is_better:
                        best_score = score
                        best_boundaries = test_boundaries
                        improved = True
            
            if not improved:
                break
            
            current_boundaries = best_boundaries.copy()
        
        return best_boundaries
    
    def _boundaries_to_communities(
        self,
        n_nodes: int,
        boundaries: List[int]
    ) -> List[int]:
        """Convert boundary list to community assignment."""
        boundaries_sorted = sorted([0] + boundaries + [n_nodes])
        communities = []
        
        for i in range(len(boundaries_sorted) - 1):
            start = boundaries_sorted[i]
            end = boundaries_sorted[i + 1]
            communities.extend([i] * (end - start))
        
        return communities


class EventSegmenter:
    """
    Main event segmentation class combining multiple methods.
    Uses hybrid approach: surprise-driven + HMM + graph refinement.
    """
    
    def __init__(self, config: Optional[SegmentationConfig] = None):
        """
        Args:
            config: Segmentation configuration
        """
        self.config = config or SegmentationConfig()
        
        self.hmm_detector = HiddenMarkovEventDetector()
        self.pe_detector = PredictionErrorDetector(
            threshold=self.config.prediction_error_threshold
        )
        self.graph_refiner = GraphBoundaryRefiner(
            metric=self.config.modularity_metric
        )
        
    def segment(
        self,
        observations: np.ndarray,
        surprise_values: Optional[np.ndarray] = None
    ) -> Dict[str, any]:
        """
        Segment observations into coherent events.
        
        Args:
            observations: Array of shape [n_timesteps, n_features]
            surprise_values: Optional pre-computed surprise values
            
        Returns:
            Dictionary containing:
                - boundaries: List of event boundary indices
                - events: List of event segments
                - confidence: Confidence scores for each boundary
        """
        n_timesteps = len(observations)
        
        # Step 1: Initial boundary detection
        if self.config.state_detection_method == "hmm":
            initial_boundaries = self.hmm_detector.segment_sequence(observations)
        elif self.config.state_detection_method == "prediction_error":
            # Use surprise values as prediction errors
            if surprise_values is None:
                raise ValueError("surprise_values required for prediction_error method")
            initial_boundaries = self.pe_detector.detect_boundaries(surprise_values)
        else:  # hybrid
            hmm_boundaries = self.hmm_detector.segment_sequence(observations)
            if surprise_values is not None:
                pe_boundaries = self.pe_detector.detect_boundaries(surprise_values)
                # Merge boundaries
                initial_boundaries = sorted(set(hmm_boundaries + pe_boundaries))
            else:
                initial_boundaries = hmm_boundaries
        
        # Step 2: Filter by min/max event length
        filtered_boundaries = self._filter_boundaries(
            initial_boundaries,
            n_timesteps
        )
        
        # Step 3: Graph-theoretic refinement
        if self.config.boundary_refinement and len(filtered_boundaries) > 0:
            refined_boundaries = self.graph_refiner.refine_boundaries(
                observations,
                filtered_boundaries
            )
        else:
            refined_boundaries = filtered_boundaries
        
        # Step 4: Extract events
        events = self._extract_events(observations, refined_boundaries)
        
        # Step 5: Compute confidence scores
        confidence_scores = self._compute_confidence(
            observations,
            refined_boundaries,
            surprise_values
        )
        
        return {
            "boundaries": refined_boundaries,
            "events": events,
            "confidence": confidence_scores,
            "n_events": len(events)
        }
    
    def _filter_boundaries(
        self,
        boundaries: List[int],
        n_timesteps: int
    ) -> List[int]:
        """Filter boundaries by event length constraints."""
        if not boundaries:
            return []
        
        filtered = []
        boundaries_extended = [0] + sorted(boundaries) + [n_timesteps]
        
        for i in range(len(boundaries_extended) - 1):
            event_length = boundaries_extended[i+1] - boundaries_extended[i]
            
            if (event_length >= self.config.min_event_length and
                event_length <= self.config.max_event_length):
                if boundaries_extended[i+1] < n_timesteps:
                    filtered.append(boundaries_extended[i+1])
        
        return filtered
    
    def _extract_events(
        self,
        observations: np.ndarray,
        boundaries: List[int]
    ) -> List[np.ndarray]:
        """Extract event segments from observations."""
        boundaries_extended = [0] + sorted(boundaries) + [len(observations)]
        events = []
        
        for i in range(len(boundaries_extended) - 1):
            start = boundaries_extended[i]
            end = boundaries_extended[i+1]
            events.append(observations[start:end])
        
        return events
    
    def _compute_confidence(
        self,
        observations: np.ndarray,
        boundaries: List[int],
        surprise_values: Optional[np.ndarray]
    ) -> List[float]:
        """Compute confidence score for each boundary."""
        if not boundaries:
            return []
        
        confidences = []
        
        for boundary in boundaries:
            # Confidence based on local surprise peak
            if surprise_values is not None:
                window_start = max(0, boundary - 5)
                window_end = min(len(surprise_values), boundary + 5)
                local_surprise = surprise_values[window_start:window_end]
                
                # Normalize
                max_surprise = np.max(local_surprise)
                mean_surprise = np.mean(surprise_values)
                
                confidence = (max_surprise - mean_surprise) / (mean_surprise + 1e-8)
                confidence = min(1.0, max(0.0, confidence))
            else:
                confidence = 0.5  # Default
            
            confidences.append(confidence)
        
        return confidences


if __name__ == "__main__":
    print("=== Event Segmentation Test ===\n")
    
    # Generate synthetic sequence with clear event structure
    np.random.seed(42)
    
    # Event 1: Cluster at origin
    event1 = np.random.randn(40, 10) * 0.5
    # Event 2: Cluster at (5, 5, ...)
    event2 = np.random.randn(30, 10) * 0.5 + 5.0
    # Event 3: Cluster at origin again
    event3 = np.random.randn(40, 10) * 0.5
    # Event 4: Cluster at (-3, -3, ...)
    event4 = np.random.randn(30, 10) * 0.5 - 3.0
    
    observations = np.vstack([event1, event2, event3, event4])
    
    # Generate surprise values (peaks at boundaries)
    surprise_values = np.random.rand(len(observations)) * 0.5
    surprise_values[38:42] += 3.0  # Boundary 1
    surprise_values[68:72] += 3.0  # Boundary 2
    surprise_values[108:112] += 3.0  # Boundary 3
    
    # Initialize segmenter
    segmenter = EventSegmenter()
    
    # Perform segmentation
    result = segmenter.segment(observations, surprise_values)
    
    print(f"Detected {result['n_events']} events")
    print(f"Boundaries: {result['boundaries']}")
    print(f"Ground truth: [40, 70, 110]")
    print(f"\nBoundary confidences: {[f'{c:.2f}' for c in result['confidence']]}")
    
    # Show event statistics
    for i, event in enumerate(result['events']):
        print(f"\nEvent {i+1}:")
        print(f"  Length: {len(event)}")
        print(f"  Mean: {np.mean(event, axis=0)[:3]}...")  # First 3 dims
