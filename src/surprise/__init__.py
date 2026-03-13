"""Bayesian surprise module for novelty and event boundary detection."""

# Use numpy-only version (no PyTorch dependency)
from .bayesian_surprise_numpy import (
    BayesianSurpriseEngine,
    SurpriseConfig
)

__all__ = [
    "BayesianSurpriseEngine",
    "SurpriseConfig"
]
