"""
Memory Forgetting and Decay
============================

Time-based forgetting following Ebbinghaus forgetting curve.
Implements activation-based memory decay with rehearsal.

References:
- Ebbinghaus (1885): Forgetting curve
- Anderson & Schooler (1991): Rational analysis of memory
- Wixted & Ebbesen (1991): Power law of forgetting
"""

import numpy as np
from typing import List
from datetime import datetime, timedelta
from dataclasses import dataclass


@dataclass
class ForgettingConfig:
    """Configuration for memory forgetting."""
    decay_rate: float = 0.5  # How fast memories decay
    rehearsal_boost: float = 1.5  # Strength multiplier on rehearsal
    min_activation: float = 0.1  # Minimum activation threshold
    use_power_law: bool = True  # Use power law vs exponential decay


class ForgettingEngine:
    """
    Manages memory decay and forgetting.

    Activation follows power law: A(t) = A0 * (1 + t)^(-d)
    where d is decay rate, t is time since encoding.

    Rehearsal resets the clock and boosts activation.
    """

    def __init__(self, config: ForgettingConfig = None):
        self.config = config or ForgettingConfig()

    def compute_activation(
        self,
        initial_activation: float,
        timestamp: datetime,
        rehearsal_count: int = 0,
        current_time: datetime = None
    ) -> float:
        """
        Compute current memory activation.

        Args:
            initial_activation: Activation at encoding (e.g., surprise score)
            timestamp: When memory was encoded
            rehearsal_count: Number of times memory was retrieved
            current_time: Current time (defaults to now)

        Returns:
            Current activation level
        """
        current_time = current_time or datetime.now()
        time_elapsed = (current_time - timestamp).total_seconds() / 3600  # hours

        # Apply rehearsal boost
        boosted_activation = initial_activation * (self.config.rehearsal_boost ** rehearsal_count)

        # Apply decay
        if self.config.use_power_law:
            # Power law decay: A(t) = A0 * (1 + t)^(-d)
            activation = boosted_activation * ((1 + time_elapsed) ** (-self.config.decay_rate))
        else:
            # Exponential decay: A(t) = A0 * e^(-dt)
            activation = boosted_activation * np.exp(-self.config.decay_rate * time_elapsed)

        return max(activation, self.config.min_activation)

    def should_forget(
        self,
        activation: float
    ) -> bool:
        """
        Determine if memory should be forgotten.

        Args:
            activation: Current activation level

        Returns:
            True if activation below threshold
        """
        return activation < self.config.min_activation

    def get_forgetting_probability(
        self,
        activation: float
    ) -> float:
        """
        Probability of forgetting given activation.

        Args:
            activation: Current activation level

        Returns:
            Probability in [0, 1]
        """
        # Sigmoid function around min_activation threshold
        x = (activation - self.config.min_activation) / self.config.min_activation
        prob = 1 / (1 + np.exp(x * 5))  # Steepness = 5
        return prob


if __name__ == "__main__":
    print("=== Memory Forgetting Test ===\n")

    engine = ForgettingEngine()

    # Test memory decay over time
    initial_activation = 2.5  # High surprise
    timestamp = datetime.now() - timedelta(hours=24)

    print(f"Initial activation: {initial_activation:.3f}")
    print(f"Encoded: {timestamp.strftime('%Y-%m-%d %H:%M')}\n")

    print("Activation decay over time:")
    for hours in [0, 1, 6, 12, 24, 48, 72, 168]:  # 0h to 1 week
        test_time = timestamp + timedelta(hours=hours)
        activation = engine.compute_activation(initial_activation, timestamp,
                                               rehearsal_count=0, current_time=test_time)
        forget_prob = engine.get_forgetting_probability(activation)

        print(f"  After {hours:3d}h: activation={activation:.3f}, forget_prob={forget_prob:.3f}")

    # Test rehearsal effect
    print("\nEffect of rehearsal (after 24 hours):")
    test_time = timestamp + timedelta(hours=24)
    for rehearsals in range(5):
        activation = engine.compute_activation(initial_activation, timestamp,
                                               rehearsal_count=rehearsals, current_time=test_time)
        print(f"  {rehearsals} rehearsals: activation={activation:.3f}")

    print("\n✓ Forgetting test complete!")
