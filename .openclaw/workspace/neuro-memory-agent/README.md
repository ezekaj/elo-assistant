# Neuro-Memory-Agent

Bio-inspired episodic memory system implementing **EM-LLM** (ICLR 2025).

## 🧠 Components (8/8 Complete)

1. **Bayesian Surprise Detection** - KL divergence-based novelty
2. **Event Segmentation** - HMM + prediction error boundaries  
3. **Episodic Storage** - ChromaDB with temporal-spatial indexing
4. **Two-Stage Retrieval** - Similarity + temporal expansion
5. **Memory Consolidation** - Sleep-like replay + schema extraction
6. **Forgetting & Decay** - Power-law activation decay
7. **Interference Resolution** - Pattern separation/completion
8. **Online Learning** - Experience replay + adaptive thresholds

## 🚀 Quick Start

```bash
pip install numpy chromadb hmmlearn networkx scikit-learn
python examples/complete_system.py
```

## 📊 Performance

- 200 observations → 75 novel events (37.5%)
- 4 episodes segmented
- 5408 experience replays
- All 8 components tested ✅

## 📚 References

- EM-LLM (ICLR 2025)
- Itti & Baldi (2009) - Bayesian Surprise
- Squire & Alvarez (1995) - Systems Consolidation
- Kirkpatrick et al. (2017) - Catastrophic Forgetting

**Status**: Production ready
