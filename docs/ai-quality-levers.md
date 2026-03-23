# AI Quality Reference — Levers, Evaluation, and Audit

This document combines three related perspectives on RAG quality into a single reference: **Quality Levers** catalogues the tuning knobs available in any RAG pipeline, **Evaluation** explains how to measure the impact of changes systematically, and **Current Settings Audit** maps those levers to this project's specific configuration and identifies weak points. Read the levers for conceptual understanding, the evaluation section to learn how to tune methodically, and the audit for project-specific action items.

## Part 1 — The Quality Levers

### 1. Chunking Strategy (Ingestion)

Your current config: **2000-char chunks (~500 tokens), 400-char overlap (~100 tokens), no sentence-boundary awareness**.

This is arguably the single biggest lever for RAG quality. It determines what the LLM "sees" as context.

- **Too large** → chunks contain mixed topics, retrieval pulls in irrelevant noise, the LLM gets confused
- **Too small** → chunks lose context, the LLM gets fragments that don't make sense on their own
- **Overlap too small** → ideas that span a chunk boundary get split and neither chunk captures the full thought
- **No sentence-boundary splitting** (your current POC choice) → chunks can cut mid-sentence, degrading both embedding quality and LLM comprehension

**What to experiment with:** chunk size (300–1000 tokens), overlap ratio, sentence-aware splitting, and semantic chunking (splitting on topic shifts rather than fixed windows). Note that chunking is currently character-based, which is only an approximation of token count — the ratio varies across languages and content types (code, math notation, non-Latin scripts). Token-aware splitting would be more precise for multilingual corpora.

### 2. System Prompts

You have two distinct prompts: one for **enrichment** (`generateObject`) and one for **chat** (`streamText`). These are where you tell the LLM _how_ to behave.

- **Enrichment prompt**: defines what a "good" summary, keywords, or MCQ looks like. Vague instructions → generic output. Specific instructions with examples → dramatically better output.
- **Chat system prompt**: defines tone, how to use the retrieved context, when to say "I don't know," and how to cite sources. A weak prompt leads to hallucination, ignoring context, or parroting chunks verbatim.

**What to experiment with:** few-shot examples in the prompt, explicit instructions about what _not_ to do, role framing ("You are a university teaching assistant..."), output format guidance.

### 3. Retrieval — Top-K and Similarity Threshold

You retrieve **top 5 chunks** from Qdrant for chat. This is a critical knob:

- **Too few** → the LLM lacks enough context to answer well, especially for broad questions
- **Too many** → irrelevant chunks dilute the context, confuse the LLM, increase hallucination
- **No similarity threshold** → even when the best match is barely relevant, the LLM still gets 5 chunks and tries to answer (instead of saying "I don't have information about that")

**What to experiment with:** top-K value (3–10), minimum similarity score cutoff, re-ranking retrieved chunks before passing to the LLM, metadata-based pre-filtering to narrow the retrieval scope before similarity search. Each chunk currently stores `mediaId`, `mediaTitle`, `mediaType` (video/pdf), `chunkText`, and either `timestamp` (for videos) or `pageNumber` (for PDFs). You could leverage these fields — or add new ones like course ID, topic tags, or speaker name — to pre-filter chunks before vector search, reducing irrelevant results without relying solely on embedding similarity.

### 4. Embedding Model

You use `mistral-embed` (1024 dimensions). The embedding model determines how well semantic similarity is captured in vector space.

- A weak embedding model may place unrelated concepts near each other → retrieval pulls wrong chunks → bad answers
- Different models have different strengths (code vs. natural language, multilingual, domain-specific)

**What to experiment with:** different embedding models (OpenAI `text-embedding-3-large`, Cohere `embed-v3`, etc.), though this requires re-ingesting the entire corpus.

### 5. LLM Model Choice

You use Mistral (EU-sovereign path). The model itself has inherent capability differences:

- Reasoning ability, instruction following, structured output reliability
- Context window size (how much retrieved context + conversation history it can handle)
- Tendency to hallucinate vs. stay grounded

**What to experiment with:** different Mistral models (Mistral Large vs. Mistral Small), or if the EU-sovereign constraint relaxes, other providers.

### 6. Context Assembly (Chat)

How you stitch retrieved chunks into the system prompt matters:

- Do you just concatenate chunks? Or do you format them with source attribution markers?
- Do you deduplicate overlapping chunks (from the 100-token overlap)?
- Do you order chunks chronologically or by relevance score?

Poor assembly → the LLM can't distinguish between sources, mixes up information, or produces disjointed answers.

**What to experiment with:** chunk deduplication (removing overlap repetition), relevance-score annotations per chunk, source-formatting strategies (numbered references, structured XML blocks), explicit instructions to the LLM about how to use the context blocks.

### 7. Conversation History Management

You send the **full** `messages` array to Mistral. As conversations grow:

- The model's context window fills up, pushing out the retrieved chunks or system prompt
- Old messages may confuse the model about what the current question is actually about
- No summarization of older turns means wasted tokens

**What to experiment with:** sliding window, summarizing older turns, only sending the last N messages + a summary.

### 8. Parsing Quality (VTT/PDF)

Garbage in, garbage out. If your VTT parser drops cues, or your PDF parser mangles text:

- Chunks contain broken text → embeddings are poor → retrieval fails → bad answers
- Citation metadata is wrong → sources point to the wrong timestamp/page

This is less of a "tuning knob" and more of a correctness issue, but it silently degrades everything downstream.

**What to experiment with:** parser validation tests against known-good output, comparing parser libraries (e.g., different PDF extractors), pre-processing steps to clean extracted text before chunking.

### Summary: Low vs. High Quality Setup

| Low-quality setup                        | High-quality setup                                 |
| ---------------------------------------- | -------------------------------------------------- |
| Fixed-size chunking cutting mid-sentence | Semantic or sentence-aware chunking                |
| Generic "answer the question" prompt     | Detailed prompt with role, constraints, examples   |
| Always returns 5 chunks, no threshold    | Top-K + minimum similarity cutoff + re-ranking     |
| Dumps chunks as raw text                 | Structured context with source labels              |
| Sends entire conversation history        | Managed history with summarization                 |
| Single model, no iteration               | A/B testing prompts, chunk sizes, retrieval params |

The biggest gains for the least effort are typically: **better prompts** (free, immediate) → **chunking strategy** (requires re-ingestion) → **retrieval tuning** (top-K, threshold) → **embedding/model upgrades** (more expensive).

---

## Part 2 — Evaluation: How to Tune Without Guessing

### Why Systematic Evaluation

The quality levers listed above interact and combine. A better prompt can compensate for mediocre chunks. A higher top-K might help with small chunks but hurt with large ones. Sentence-aware splitting changes what the embedding model "sees," which changes what retrieval returns, which changes what the LLM receives. Testing every combination is impractical.

On top of that, LLMs are non-deterministic. Regenerating the same prompt can give different results. So who's to say a better result came from the setting change and not just from luck on that particular run?

The answer is not to guess harder — it's to adopt a systematic evaluation methodology. RAG quality tuning is more like empirical science than engineering — you form hypotheses, control variables, measure outcomes, and iterate. The levers listed in this document aren't a recipe; they're the **search space**. The eval set and scoring framework are what turn it from guessing into methodology.

### Dealing With Non-Determinism

You can't evaluate on a single run. You need multiple runs (e.g., 5–10) per configuration and look at aggregate quality. This requires:

- **A fixed evaluation set** — a set of questions with known good answers that you run every time you change a setting. This is often called an **eval set** or **golden dataset**.
- **Pinned temperature** — setting `temperature: 0` reduces output variation but does not eliminate it (floating-point non-determinism, batching, and provider implementation details can still cause differences). Some providers (including Mistral) also support a `seed` parameter alongside low temperature for more reproducible outputs. For evaluation, pin temperature low (and set a seed if available) to reduce noise. For production, you may use a slightly higher value for more natural responses.
- **Multiple runs per config** — even with low temperature, run each question several times and look at the distribution, not a single output.

Without this, you're unable to tell if an improvement came from the change or from luck.

### Handling the Combinatorial Explosion

The levers interact, so the ideal values are a combination, not individual optima. In practice, teams handle this by:

1. **Changing one variable at a time** against the eval set (scientific method — slow but reliable)
2. **Starting with the cheapest, most isolated lever** — prompts don't affect ingestion, so you can iterate on them without re-embedding anything
3. **Using an evaluation framework** that automates the "run N times, score results, compare distributions" loop

### The Standard Metrics

The open-source project **Ragas** (Retrieval Augmented Generation Assessment) defined the metrics that most of the industry now uses. They decompose "answer quality" into independent, measurable dimensions:

| Metric                | What it measures                                                                      | How it's computed                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Faithfulness**      | Does the answer only use information from the retrieved context? (anti-hallucination) | An LLM decomposes the answer into claims, then checks each claim against the context                                  |
| **Answer Relevancy**  | Does the answer actually address the question?                                        | An LLM generates questions that the answer _would_ answer, then measures semantic similarity to the original question |
| **Context Precision** | Are the retrieved chunks actually relevant to the question? (retrieval quality)       | An LLM judges each retrieved chunk as relevant or not, weighted by rank position                                      |
| **Context Recall**    | Did retrieval find _all_ the information needed to answer?                            | Compares retrieved context against a ground-truth reference answer                                                    |

These four metrics cleanly separate **retrieval problems** (context precision/recall) from **generation problems** (faithfulness/relevancy). This is critical — if your answers are bad because retrieval is pulling wrong chunks, no amount of prompt engineering will fix it. The metrics tell you _where_ in the pipeline the problem lives.

### The Evaluation Workflow

```
1. BUILD EVAL SET
   20-50 questions with reference answers, covering:
   - Simple factual lookups ("What does Professor X say about Y?")
   - Cross-document reasoning ("Compare the approaches in Lecture 3 and 5")
   - Out-of-scope questions ("What is the capital of France?" — should get "I don't know")
   - Edge cases specific to your domain

   Reference answers should be written by someone who has read the source material,
   should cite the specific passages that support the answer, and should be concise
   enough to score against programmatically.

2. RUN PIPELINE
   For each question, capture:
   - The retrieved chunks (+ their similarity scores)
   - The assembled context
   - The generated answer
   - Token counts / latency / cost

3. SCORE
   Run Ragas (or equivalent) across all questions.
   Get per-question and aggregate scores for each metric.

4. DIAGNOSE
   - Low context precision → retrieval is pulling irrelevant chunks
     → fix: chunking, embedding model, similarity threshold
   - Low context recall → retrieval is missing relevant chunks
     → fix: chunk size (maybe too large), overlap, top-K
   - Low faithfulness → LLM is hallucinating beyond the context
     → fix: system prompt, temperature, model choice
   - Low answer relevancy → LLM is rambling or off-topic
     → fix: system prompt, fewer distracting chunks

5. CHANGE ONE LEVER, RE-RUN, COMPARE
```

### The Tools

**Evaluation frameworks:**

- **Ragas** — open-source Python library, the de facto standard. Computes all four metrics above. Works with any LLM as judge.
- **DeepEval** — similar to Ragas but with more metrics (bias, toxicity, etc.) and a hosted dashboard
- **LangSmith** (by LangChain) — commercial platform with tracing, eval sets, comparison views, LLM-as-judge scoring, and built-in observability (traces every pipeline step with latency and cost)
- **Braintrust** — commercial, strong on A/B comparison between configurations
- **Phoenix** (by Arize) — open-source observability + evals, good visualization of retrieval quality

**Observability / tracing** (see what's happening inside the pipeline):

- **LangFuse** — open-source, self-hostable. Traces every step: query → embedding → retrieval → context assembly → LLM call → response. Shows latency, token usage, and cost per step.
- These tools (including LangSmith, listed above) let you inspect individual bad answers and see _exactly_ which chunks were retrieved and what the LLM received

### What's Realistic for a POC

The full framework above is what production RAG teams do. For a POC, a pragmatic subset:

1. **Write 20 eval questions** with expected answers based on the actual fixtures
2. **Write a script** that runs each question through the `/chat` endpoint, captures the answer
3. **Use a simple LLM-as-judge** — a single prompt that scores each answer on faithfulness (1–5) and relevancy (1–5)
4. **Log retrieved chunks** alongside answers so you can manually inspect retrieval quality when scores are low
5. **Compare configurations** by running the same eval set with different settings and comparing average scores

This gets you 80% of the value of the full framework with a fraction of the setup.

The good news: for a POC with a small corpus, the search space is manageable. A decent eval set of 20 questions, a scoring prompt, and a few afternoons of iteration will get you far.

---

## Part 3 — Current Settings Audit

Key files referenced below (all under `apps/api/src/`):

- **`routes/chat.ts`** — chat endpoint handler, builds the system prompt and streams the LLM response
- **`routes/enrich.ts`** — enrichment pipeline, generates summaries/keywords/MCQs from transcripts
- **`lib/rag-query.ts`** — retrieval + context assembly, queries Qdrant and formats chunks for the LLM

### Current Settings

| Lever                    | Current Value                           | Verdict                |
| ------------------------ | --------------------------------------- | ---------------------- |
| Chunk size               | 2000 chars (~500 tokens)                | Reasonable default     |
| Chunk overlap            | 400 chars (~100 tokens)                 | Reasonable default     |
| Sentence-aware splitting | **None** — character-level slicing      | Weak point             |
| Top-K                    | 5                                       | OK for small corpus    |
| Similarity threshold     | **None**                                | Weak point             |
| Re-ranking               | **None**                                | Weak point             |
| Embedding model          | `mistral-embed` (1024-dim)              | Fine for POC           |
| Distance metric          | Cosine                                  | Standard choice        |
| LLM model                | `mistral-large-latest`                  | Best available Mistral |
| History truncation       | **None** — full history sent every time | Weak point             |

---

### The Prompts (biggest quick wins here)

**Chat system prompt** (`chat.ts:103`):

```
You are a helpful educational assistant. Answer based on the provided
media content only.

Context:
${context}
```

This is very minimal. No role framing, no citation instructions, no "say I don't know" fallback, no few-shot examples.

**Enrichment prompt** (`enrich.ts:39`):

```
Analyze this educational media content and generate enrichment
metadata in JSON:

${transcript.rawText.slice(0, 8000)}
```

Also minimal. Uses only the first 8000 characters of the transcript, no guidance on quality expectations for summaries/MCQs.

---

### Context Assembly (`rag-query.ts:41-43`)

```typescript
const context = points
  .map((r) => `[${r.payload!.mediaTitle}]\n${r.payload!.chunkText}`)
  .join('\n\n---\n\n');
```

Straightforward concatenation with media title labels. No deduplication of overlapping chunks, no relevance score annotation, no instruction to the LLM about how to use these blocks.

---

### The 5 Weak Points Worth Addressing

**1. Prompts** — Add source citation instructions, an "I don't have information about that" fallback, tone/audience framing (e.g., "explain to a university student"), and a few-shot example of a good answer.

**2. Similarity threshold** — Add a minimum score cutoff (e.g., 0.7 cosine similarity) and return "no relevant context found" when nothing passes.

**3. History management** — Send only the last N messages (e.g., 10) plus the system prompt.

**4. Sentence-aware chunking** — Break at the nearest `.` or `\n` within a tolerance window instead of slicing at fixed character boundaries.

**5. Enrichment prompt truncation** — The enrichment prompt (`enrich.ts:39`) sends only the first 8000 characters of the transcript to the LLM. For long lectures, the summary, keywords, and MCQs are based on a fraction of the content. Consider processing the full transcript (in chunks if needed) or at minimum increasing the limit.
