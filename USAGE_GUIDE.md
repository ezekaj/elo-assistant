# Neuro-Memory-Agent: Real-World Usage Guide

## Quick Start (5 minutes)

### 1. Basic Integration

```python
from src.surprise import BayesianSurpriseEngine, SurpriseConfig
from src.segmentation import EventSegmenter, SegmentationConfig
from src.memory import EpisodicMemoryStore, EpisodicMemoryConfig
from src.retrieval import TwoStageRetriever, RetrievalConfig

# Initialize system
input_dim = 768  # embedding dimension (e.g., from sentence-transformers)

surprise_engine = BayesianSurpriseEngine(
    input_dim=input_dim,
    config=SurpriseConfig(
        window_size=50,
        surprise_threshold=0.7,
        use_adaptive_threshold=True
    )
)

segmenter = EventSegmenter(SegmentationConfig(min_event_length=10))
memory = EpisodicMemoryStore(EpisodicMemoryConfig(max_episodes=1000, embedding_dim=input_dim))
retriever = TwoStageRetriever(memory, RetrievalConfig(k_similarity=10))
```

### 2. Processing New Observations

```python
# Stream of observations (e.g., user messages, sensor data, documents)
observations = [get_embedding(text) for text in user_messages]

# Detect surprise
results = surprise_engine.process_sequence(observations)
surprise_values = [r['surprise'] for r in results]

# Segment into events
segmentation = segmenter.segment(observations, surprise_values)

# Store in memory
for i in range(segmentation['n_events']):
    start = segmentation['boundaries'][i]
    end = segmentation['boundaries'][i+1] if i+1 < len(segmentation['boundaries']) else len(observations)

    episode_embedding = np.mean(observations[start:end], axis=0)
    memory.store_episode(
        content={"text": user_messages[start:end]},
        embedding=episode_embedding,
        surprise=np.mean(surprise_values[start:end])
    )
```

### 3. Retrieving Relevant Memories

```python
# Query with new observation
query_embedding = get_embedding("Tell me about that restaurant we discussed")

# Two-stage retrieval
retrieved = retriever.retrieve(
    query_embedding=query_embedding,
    k=5,  # top 5 results
    temporal_weight=0.3  # balance similarity vs recency
)

# Use retrieved context
for episode in retrieved:
    print(f"Memory: {episode['content']}")
    print(f"Surprise: {episode['surprise']:.2f}")
    print(f"Timestamp: {episode['timestamp']}")
```

## Real-World Use Cases

### Use Case 1: Chatbot with Long-Term Memory

```python
from datetime import datetime
from sentence_transformers import SentenceTransformer

# Setup
encoder = SentenceTransformer('all-MiniLM-L6-v2')  # 384-dim embeddings
input_dim = 384

# Initialize system
surprise_engine = BayesianSurpriseEngine(input_dim, SurpriseConfig())
memory = EpisodicMemoryStore(EpisodicMemoryConfig(max_episodes=10000, embedding_dim=input_dim))
retriever = TwoStageRetriever(memory)

def process_conversation(user_message):
    # Encode message
    embedding = encoder.encode(user_message)

    # Check surprise
    surprise_info = surprise_engine.compute_surprise(embedding)

    # Store if surprising (novel information)
    if surprise_info['is_novel']:
        memory.store_episode(
            content={"message": user_message},
            embedding=embedding,
            surprise=surprise_info['surprise'],
            timestamp=datetime.now()
        )

    # Retrieve relevant context
    context = retriever.retrieve(embedding, k=3)

    # Generate response with context
    return generate_response(user_message, context)

# Usage
while True:
    user_input = input("You: ")
    response = process_conversation(user_input)
    print(f"Bot: {response}")
```

### Use Case 2: Document Processing Pipeline

```python
from src.consolidation import MemoryConsolidationEngine, ConsolidationConfig

# Initialize
consolidation = MemoryConsolidationEngine(ConsolidationConfig(replay_batch_size=32))

def process_document_stream(documents):
    """Process stream of documents, extract key insights"""

    embeddings = [encoder.encode(doc) for doc in documents]

    # Detect surprise
    results = surprise_engine.process_sequence(embeddings)
    surprise_values = [r['surprise'] for r in results]

    # Segment into topics
    segmentation = segmenter.segment(embeddings, surprise_values)

    # Store episodes
    for i in range(segmentation['n_events']):
        start, end = get_segment_bounds(segmentation, i, len(embeddings))

        episode_embedding = np.mean(embeddings[start:end], axis=0)
        memory.store_episode(
            content={
                "documents": documents[start:end],
                "topic": f"Topic {i+1}"
            },
            embedding=episode_embedding,
            surprise=np.mean(surprise_values[start:end])
        )

    # Consolidate to extract schemas
    consolidation.consolidate(memory.episodes)
    schemas = consolidation.get_schema_summary()

    return schemas

# Usage
documents = load_documents("data/corpus.txt")
key_themes = process_document_stream(documents)
print(f"Extracted {len(key_themes)} key themes")
```

### Use Case 3: Anomaly Detection System

```python
def monitor_sensor_stream(sensor_data_stream):
    """Real-time anomaly detection on sensor data"""

    for sensor_reading in sensor_data_stream:
        # Convert to embedding (or use raw features)
        observation = np.array(sensor_reading)

        # Compute surprise
        surprise_info = surprise_engine.compute_surprise(observation)

        # Alert on high surprise (anomaly)
        if surprise_info['surprise'] > surprise_info['threshold'] * 1.5:
            alert_anomaly(sensor_reading, surprise_info['surprise'])

            # Store anomaly for pattern learning
            memory.store_episode(
                content={"sensor_data": sensor_reading, "type": "anomaly"},
                embedding=observation,
                surprise=surprise_info['surprise']
            )
```

### Use Case 4: Online Learning Agent

```python
from src.online_learning import OnlineLearner, OnlineLearningConfig

# Initialize
learner = OnlineLearner(
    input_dim=input_dim,
    config=OnlineLearningConfig(
        buffer_size=1000,
        update_frequency=10
    )
)

def continuous_learning_loop(data_stream):
    """Continuously learn from data stream"""

    for batch in data_stream:
        embeddings = [encoder.encode(item) for item in batch]

        # Online update
        for emb in embeddings:
            surprise_info = surprise_engine.compute_surprise(emb)

            # Add to replay buffer
            learner.add_to_replay_buffer(emb, surprise_info['surprise'])

            # Periodic model update
            if learner.should_update():
                learner.online_update()
```

## Performance Tips

### 1. Batch Processing
```python
# Process observations in batches for efficiency
batch_size = 100
for i in range(0, len(observations), batch_size):
    batch = observations[i:i+batch_size]
    results = surprise_engine.process_sequence(batch)
```

### 2. Async Storage
```python
import asyncio

async def store_episode_async(episode_data):
    """Non-blocking episode storage"""
    await memory.store_episode(**episode_data)
```

### 3. Memory Management
```python
from src.memory.forgetting import ForgettingEngine, ForgettingConfig

# Auto-cleanup old memories
forgetting_engine = ForgettingEngine(ForgettingConfig(decay_rate=0.5))

# Periodic cleanup
def cleanup_old_memories():
    for episode in memory.episodes:
        activation = forgetting_engine.compute_activation(
            episode['timestamp'],
            episode['surprise']
        )
        if forgetting_engine.should_forget(activation):
            memory.remove_episode(episode['id'])
```

## Configuration Best Practices

### For High-Recall Applications (e.g., personal assistant)
```python
SurpriseConfig(
    window_size=100,  # Longer context
    surprise_threshold=0.5,  # Lower threshold (store more)
    use_adaptive_threshold=True
)
```

### For High-Precision Applications (e.g., anomaly detection)
```python
SurpriseConfig(
    window_size=50,
    surprise_threshold=1.2,  # Higher threshold (store only critical)
    use_adaptive_threshold=False
)
```

### For Real-Time Systems (e.g., live monitoring)
```python
SurpriseConfig(
    window_size=30,  # Smaller window for speed
    surprise_threshold=0.7,
    use_adaptive_threshold=True
)
```

## Common Patterns

### Pattern 1: Query-Response with Context
```python
def answer_with_memory(query):
    query_emb = encoder.encode(query)
    context = retriever.retrieve(query_emb, k=5)

    # Format context for LLM
    context_text = "\n".join([ep['content']['text'] for ep in context])
    prompt = f"Context:\n{context_text}\n\nQuery: {query}\n\nAnswer:"

    return llm.generate(prompt)
```

### Pattern 2: Incremental Learning
```python
def learn_from_interaction(user_input, system_response, feedback):
    """Learn from user feedback"""
    interaction_emb = encoder.encode(f"{user_input} {system_response}")

    surprise_info = surprise_engine.compute_surprise(interaction_emb)

    # Store with feedback weight
    memory.store_episode(
        content={"input": user_input, "response": system_response, "feedback": feedback},
        embedding=interaction_emb,
        surprise=surprise_info['surprise'] * (1 + feedback)  # Weight by feedback
    )
```

### Pattern 3: Multi-Modal Memory
```python
def store_multimodal_episode(text, image, audio):
    """Store episode with multiple modalities"""
    text_emb = text_encoder.encode(text)
    image_emb = image_encoder.encode(image)
    audio_emb = audio_encoder.encode(audio)

    # Combine embeddings (e.g., concatenate or weighted sum)
    combined_emb = np.concatenate([text_emb, image_emb, audio_emb])

    surprise_info = surprise_engine.compute_surprise(combined_emb)

    memory.store_episode(
        content={"text": text, "image_path": image, "audio_path": audio},
        embedding=combined_emb,
        surprise=surprise_info['surprise']
    )
```

## Deployment Checklist

- [ ] Choose appropriate `input_dim` (match your embedding model)
- [ ] Set `window_size` based on your data velocity
- [ ] Configure `surprise_threshold` (test with sample data)
- [ ] Enable `use_adaptive_threshold` for dynamic environments
- [ ] Set `max_episodes` based on memory constraints
- [ ] Implement forgetting mechanism for long-running systems
- [ ] Add monitoring for surprise distribution
- [ ] Set up periodic consolidation for schema extraction
- [ ] Implement backup/restore for episodic memory
- [ ] Add logging for debugging

## Next Steps

1. **Run examples/complete_system.py** to see full pipeline
2. **Run test_new_data.py** to understand behavior on different data
3. **Integrate with your embedding model** (sentence-transformers, OpenAI, etc.)
4. **Start with small dataset** to tune parameters
5. **Monitor surprise distribution** to validate thresholds
6. **Scale up** once behavior is validated

## Troubleshooting

### Memory grows too large
- Lower `max_episodes`
- Enable forgetting mechanism
- Increase `surprise_threshold`

### Missing important events
- Lower `surprise_threshold`
- Increase `window_size`
- Enable `use_adaptive_threshold`

### Too many false positives
- Increase `surprise_threshold`
- Use `kl_method="symmetric"` for stability
- Increase `min_observations`

## Support

- GitHub Issues: [link to repo]
- Documentation: See `/docs` folder
- Examples: See `/examples` folder
- Tests: See `test_new_data.py` for diverse scenarios
