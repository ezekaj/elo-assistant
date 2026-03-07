"""Neuro-Memory-Agent: Bio-inspired episodic memory system."""

__version__ = "1.0.0"
__author__ = "Neuro-Memory-Agent Team"

from .surprise import BayesianSurpriseEngine, SurpriseConfig
from .segmentation import EventSegmenter, SegmentationConfig
from .memory import EpisodicMemoryStore, EpisodicMemoryConfig, Episode
from .retrieval import TwoStageRetriever, RetrievalConfig

__all__ = [
    "BayesianSurpriseEngine",
    "SurpriseConfig",
    "EventSegmenter",
    "SegmentationConfig",
    "EpisodicMemoryStore",
    "EpisodicMemoryConfig",
    "Episode",
    "TwoStageRetriever",
    "RetrievalConfig"
]
