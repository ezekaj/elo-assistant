"""
Online Continual Learning
=========================

Adaptive learning that updates models without catastrophic forgetting.
Implements Elastic Weight Consolidation (EWC) and experience replay.

References:
- Kirkpatrick et al. (2017): Overcoming catastrophic forgetting
- Rolnick et al. (2019): Experience replay for continual learning
- Zenke et al. (2017): Continual learning through synaptic intelligence
"""

import numpy as np
from typing import List, Dict, Optional, Callable
from dataclasses import dataclass
from collections import deque


@dataclass
class OnlineLearningConfig:
    """Configuration for online learning."""
    learning_rate: float = 0.01  # Base learning rate
    ewc_lambda: float = 0.5  # EWC regularization strength
    replay_buffer_size: int = 1000  # Max replay samples
    replay_batch_size: int = 32  # Samples per replay
    adaptive_threshold: bool = True  # Adjust thresholds online
    threshold_alpha: float = 0.1  # Threshold update rate


class OnlineLearner:
    """
    Online continual learning with catastrophic forgetting prevention.

    Key mechanisms:
    1. Experience Replay: Store and replay important examples
    2. Elastic Weight Consolidation: Protect important parameters
    3. Adaptive Thresholds: Adjust novelty/surprise thresholds online
    """

    def __init__(self, config: OnlineLearningConfig = None):
        self.config = config or OnlineLearningConfig()

        # Replay buffer (stores important experiences)
        self.replay_buffer = deque(maxlen=self.config.replay_buffer_size)

        # Fisher information (importance of each parameter)
        self.fisher_information = {}

        # Adaptive thresholds
        self.surprise_threshold = 1.0  # Initial surprise threshold
        self.novelty_threshold = 0.7  # Initial novelty threshold

        # Statistics
        self.total_updates = 0
        self.replay_count = 0

    def add_to_replay_buffer(
        self,
        observation: np.ndarray,
        surprise: float,
        metadata: Optional[Dict] = None
    ):
        """
        Add observation to replay buffer.

        High-surprise events are more likely to be retained.

        Args:
            observation: Observation vector
            surprise: Surprise score
            metadata: Optional metadata
        """
        # Priority = surprise score
        priority = surprise

        # Reservoir sampling with priority
        if len(self.replay_buffer) < self.config.replay_buffer_size:
            self.replay_buffer.append({
                'observation': observation,
                'surprise': surprise,
                'priority': priority,
                'metadata': metadata or {}
            })
        else:
            # Replace lowest priority sample if new one is more important
            min_priority_idx = min(
                range(len(self.replay_buffer)),
                key=lambda i: self.replay_buffer[i]['priority']
            )
            if priority > self.replay_buffer[min_priority_idx]['priority']:
                self.replay_buffer[min_priority_idx] = {
                    'observation': observation,
                    'surprise': surprise,
                    'priority': priority,
                    'metadata': metadata or {}
                }

    def sample_replay_batch(
        self,
        batch_size: Optional[int] = None
    ) -> List[Dict]:
        """
        Sample batch from replay buffer for rehearsal.

        Args:
            batch_size: Number of samples (defaults to config)

        Returns:
            List of sampled experiences
        """
        batch_size = batch_size or self.config.replay_batch_size

        if len(self.replay_buffer) == 0:
            return []

        # Sample with priority (higher surprise = higher probability)
        priorities = np.array([exp['priority'] for exp in self.replay_buffer])
        probabilities = priorities / np.sum(priorities)

        sample_size = min(batch_size, len(self.replay_buffer))
        indices = np.random.choice(
            len(self.replay_buffer),
            size=sample_size,
            replace=False,
            p=probabilities
        )

        return [self.replay_buffer[i] for i in indices]

    def update_adaptive_threshold(
        self,
        current_value: float,
        threshold_type: str = 'surprise'
    ):
        """
        Update adaptive threshold using exponential moving average.

        Args:
            current_value: Current surprise or novelty value
            threshold_type: 'surprise' or 'novelty'
        """
        if not self.config.adaptive_threshold:
            return

        alpha = self.config.threshold_alpha

        if threshold_type == 'surprise':
            # Update surprise threshold
            self.surprise_threshold = (
                (1 - alpha) * self.surprise_threshold +
                alpha * current_value
            )
        elif threshold_type == 'novelty':
            # Update novelty threshold
            self.novelty_threshold = (
                (1 - alpha) * self.novelty_threshold +
                alpha * current_value
            )

    def compute_ewc_loss(
        self,
        current_params: Dict[str, np.ndarray],
        old_params: Dict[str, np.ndarray]
    ) -> float:
        """
        Compute Elastic Weight Consolidation loss.

        Penalizes changes to important parameters.

        Args:
            current_params: Current model parameters
            old_params: Previous model parameters

        Returns:
            EWC regularization loss
        """
        ewc_loss = 0.0

        for param_name in current_params:
            if param_name in self.fisher_information and param_name in old_params:
                # L2 penalty weighted by Fisher information
                param_diff = current_params[param_name] - old_params[param_name]
                fisher = self.fisher_information[param_name]
                ewc_loss += np.sum(fisher * (param_diff ** 2))

        return self.config.ewc_lambda * ewc_loss / 2.0

    def update_fisher_information(
        self,
        param_name: str,
        gradient: np.ndarray
    ):
        """
        Update Fisher information matrix estimate.

        Fisher information ≈ gradient^2 (squared gradients)

        Args:
            param_name: Parameter identifier
            gradient: Gradient for this parameter
        """
        if param_name not in self.fisher_information:
            self.fisher_information[param_name] = np.zeros_like(gradient)

        # Running average of squared gradients
        self.fisher_information[param_name] = (
            0.9 * self.fisher_information[param_name] +
            0.1 * (gradient ** 2)
        )

    def online_update(
        self,
        observation: np.ndarray,
        surprise: float,
        update_fn: Optional[Callable] = None
    ):
        """
        Perform online update with experience replay and EWC.

        Args:
            observation: New observation
            surprise: Surprise score
            update_fn: Optional function to update model
        """
        # Add to replay buffer
        self.add_to_replay_buffer(observation, surprise)

        # Update adaptive threshold
        self.update_adaptive_threshold(surprise, 'surprise')

        # Perform model update (if update function provided)
        if update_fn is not None:
            update_fn(observation)

        # Experience replay
        if len(self.replay_buffer) >= self.config.replay_batch_size:
            replay_batch = self.sample_replay_batch()
            for exp in replay_batch:
                if update_fn is not None:
                    update_fn(exp['observation'])
            self.replay_count += len(replay_batch)

        self.total_updates += 1

    def get_statistics(self) -> Dict:
        """Get online learning statistics."""
        return {
            'total_updates': self.total_updates,
            'replay_count': self.replay_count,
            'replay_buffer_size': len(self.replay_buffer),
            'surprise_threshold': self.surprise_threshold,
            'novelty_threshold': self.novelty_threshold,
            'fisher_params': len(self.fisher_information)
        }


if __name__ == "__main__":
    print("=== Online Continual Learning Test ===\n")

    learner = OnlineLearner()

    # Simulate online learning
    print("Simulating online learning stream...")

    np.random.seed(42)
    for i in range(100):
        # Random observation
        obs = np.random.randn(128)

        # Random surprise (with occasional high-surprise events)
        surprise = np.random.exponential(0.5)
        if i % 20 == 0:
            surprise *= 5.0  # High surprise event

        # Add to replay buffer and update
        learner.online_update(obs, surprise)

    stats = learner.get_statistics()

    print(f"\nLearning Statistics:")
    print(f"  Total updates: {stats['total_updates']}")
    print(f"  Replay count: {stats['replay_count']}")
    print(f"  Replay buffer size: {stats['replay_buffer_size']}")
    print(f"  Adaptive surprise threshold: {stats['surprise_threshold']:.3f}")
    print(f"  Adaptive novelty threshold: {stats['novelty_threshold']:.3f}")

    # Test replay sampling
    print(f"\nReplay Buffer Statistics:")
    replay_batch = learner.sample_replay_batch(10)
    surprises = [exp['surprise'] for exp in replay_batch]
    print(f"  Sampled batch size: {len(replay_batch)}")
    print(f"  Mean surprise in batch: {np.mean(surprises):.3f}")
    print(f"  Max surprise in batch: {np.max(surprises):.3f}")

    print("\n✓ Online learning test complete!")
