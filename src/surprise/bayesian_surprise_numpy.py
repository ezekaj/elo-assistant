"""
Bayesian Surprise Engine (NumPy-only version)
=============================================

Lightweight implementation without PyTorch dependency.
Uses statistical methods for surprise calculation.

References:
- Itti & Baldi (2009). "Bayesian Surprise Attracts Human Attention"
- EM-LLM (ICLR 2025): Event segmentation using Bayesian surprise
"""

import numpy as np
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from collections import deque


@dataclass
class SurpriseConfig:
    """Configuration for Bayesian surprise calculation."""
    window_size: int = 50
    surprise_threshold: float = 0.7
    kl_method: str = "symmetric"
    use_adaptive_threshold: bool = True
    min_observations: int = 10
    smoothing_alpha: float = 0.1


class BayesianSurpriseEngine:
    """
    NumPy-only Bayesian surprise engine.
    
    Computes surprise as KL divergence between prior and posterior distributions.
    High surprise → Event boundary → Memory encoding trigger.
    """
    
    def __init__(self, input_dim: int, config: Optional[SurpriseConfig] = None):
        self.input_dim = input_dim
        self.config = config or SurpriseConfig()
        
        # Observation history (sliding window)
        self.observation_history = deque(maxlen=self.config.window_size)
        
        # Surprise history for adaptive thresholding
        self.surprise_history = deque(maxlen=100)
        
        # Running statistics
        self.step_count = 0
        self.total_surprise = 0.0
        self.mean_surprise = 0.0
        self.std_surprise = 1.0
    
    def calculate_kl_divergence(
        self,
        prior_mean: np.ndarray,
        prior_var: np.ndarray,
        posterior_mean: np.ndarray,
        posterior_var: np.ndarray
    ) -> float:
        """Calculate KL divergence between two Gaussian distributions."""
        prior_var = np.maximum(prior_var, 1e-8)
        posterior_var = np.maximum(posterior_var, 1e-8)
        
        if self.config.kl_method == "forward":
            kl = 0.5 * np.sum(
                (posterior_var / prior_var) +
                ((prior_mean - posterior_mean) ** 2) / prior_var -
                1 +
                np.log(prior_var / posterior_var)
            )
        elif self.config.kl_method == "reverse":
            kl = 0.5 * np.sum(
                (prior_var / posterior_var) +
                ((posterior_mean - prior_mean) ** 2) / posterior_var -
                1 +
                np.log(posterior_var / prior_var)
            )
        else:  # symmetric (Jensen-Shannon divergence)
            m_mean = 0.5 * (prior_mean + posterior_mean)
            m_var = 0.5 * (prior_var + posterior_var)
            
            kl_prior = 0.5 * np.sum(
                (prior_var / m_var) +
                ((m_mean - prior_mean) ** 2) / m_var -
                1 +
                np.log(m_var / prior_var)
            )
            kl_posterior = 0.5 * np.sum(
                (posterior_var / m_var) +
                ((m_mean - posterior_mean) ** 2) / m_var -
                1 +
                np.log(m_var / posterior_var)
            )
            
            kl = 0.5 * (kl_prior + kl_posterior)
        
        return max(0.0, kl)
    
    def update_prior(self, observation: np.ndarray):
        """Update prior distribution based on new observation."""
        self.observation_history.append(observation.copy())
    
    def get_prior_distribution(self) -> Tuple[np.ndarray, np.ndarray]:
        """Estimate prior distribution from observation history."""
        if len(self.observation_history) < self.config.min_observations:
            return (
                np.zeros(self.input_dim),
                np.ones(self.input_dim)
            )
        
        observations = np.array(self.observation_history)
        prior_mean = np.mean(observations, axis=0)
        prior_var = np.var(observations, axis=0) + 1e-8
        
        return prior_mean, prior_var
    
    def get_posterior_distribution(
        self,
        observation: np.ndarray,
        prior_mean: np.ndarray,
        prior_var: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray]:
        """Calculate posterior distribution using Bayesian update."""
        obs_var = 0.1 * np.ones_like(observation)
        
        prior_precision = 1.0 / prior_var
        obs_precision = 1.0 / obs_var
        
        posterior_precision = prior_precision + obs_precision
        posterior_var = 1.0 / posterior_precision
        
        posterior_mean = posterior_var * (prior_precision * prior_mean + obs_precision * observation)
        
        return posterior_mean, posterior_var
    
    def compute_surprise(self, observation: np.ndarray) -> Dict[str, float]:
        """
        Compute Bayesian surprise for a new observation.
        
        Args:
            observation: New observation [input_dim]
            
        Returns:
            Dictionary with surprise metrics
        """
        prior_mean, prior_var = self.get_prior_distribution()
        
        posterior_mean, posterior_var = self.get_posterior_distribution(
            observation, prior_mean, prior_var
        )
        
        surprise = self.calculate_kl_divergence(
            prior_mean, prior_var,
            posterior_mean, posterior_var
        )
        
        self.step_count += 1
        self.total_surprise += surprise
        
        alpha = self.config.smoothing_alpha
        self.mean_surprise = alpha * surprise + (1 - alpha) * self.mean_surprise
        
        self.surprise_history.append(surprise)
        
        if len(self.surprise_history) > 10:
            surprise_array = np.array(self.surprise_history)
            self.std_surprise = np.std(surprise_array)
            normalized_surprise = (surprise - self.mean_surprise) / (self.std_surprise + 1e-8)
        else:
            normalized_surprise = 0.0
        
        if self.config.use_adaptive_threshold and len(self.surprise_history) > 20:
            threshold = np.percentile(self.surprise_history, 75)
        else:
            threshold = self.config.surprise_threshold
        
        is_novel = surprise > threshold
        
        self.update_prior(observation)
        
        return {
            "surprise": surprise,
            "normalized_surprise": normalized_surprise,
            "is_novel": is_novel,
            "threshold": threshold,
            "mean_surprise": self.mean_surprise,
            "prior_mean": prior_mean,
            "posterior_mean": posterior_mean
        }
    
    def process_sequence(
        self,
        observations: List[np.ndarray]
    ) -> List[Dict[str, float]]:
        """Process a sequence of observations."""
        results = []
        for obs in observations:
            surprise_info = self.compute_surprise(obs)
            results.append(surprise_info)
        return results
    
    def get_event_boundaries(
        self,
        surprise_values: List[float],
        method: str = "peaks"
    ) -> List[int]:
        """Detect event boundaries from surprise signal."""
        boundaries = []
        
        if method == "peaks":
            for i in range(1, len(surprise_values) - 1):
                if (surprise_values[i] > surprise_values[i-1] and
                    surprise_values[i] > surprise_values[i+1] and
                    surprise_values[i] > self.mean_surprise):
                    boundaries.append(i)
        else:
            for i, surprise in enumerate(surprise_values):
                if surprise > self.config.surprise_threshold:
                    boundaries.append(i)
        
        return boundaries
    
    def reset(self):
        """Reset the surprise engine."""
        self.observation_history.clear()
        self.surprise_history.clear()
        self.step_count = 0
        self.total_surprise = 0.0
        self.mean_surprise = 0.0
        self.std_surprise = 1.0
