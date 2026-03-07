"""Bayesian surprise module for novelty and event boundary detection."""

from .bayesian_surprise import (
    BayesianSurpriseEngine,
    SurpriseConfig,
    PredictiveModel
)

__all__ = [
    "BayesianSurpriseEngine",
    "SurpriseConfig",
    "PredictiveModel"
]
