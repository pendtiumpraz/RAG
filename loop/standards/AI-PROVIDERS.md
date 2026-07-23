# AI-PROVIDERS.md — Research AI Provider & Model Terbaru (Juni 2026)

> **Daftar lengkap AI providers dan model terbaru per Juni 2026. Data dari research real-time via dokumentasi resmi masing-masing provider.**

---

## 📊 Perbandingan Cepat

| Provider | Model Flagship | Context | Input Price/MTok | Output Price/MTok | Best For |
|----------|---------------|---------|-----------------|------------------|----------|
| OpenAI | GPT-5.5 | 270K+ | $5.00 | $30.00 | Coding kompleks, professional work |
| Anthropic | Claude Fable 5 | 1M | $10.00 | $50.00 | Agentic coding, reasoning |
| Google | Gemini 2.5 Pro | 1M | — | — | Complex reasoning, multimodal |
| DeepSeek | DeepSeek-V4 | 64K+ | $0.14 | $0.28 | Low-cost, competitive performance |
| Cohere | Command A+ | 128K | — | — | Enterprise, multilingual, RAG |
| Meta | Llama 4 | 1M | Free (open) | Free (open) | Self-hosted, customization |
| Mistral | Mistral Large | 128K | — | — | Privacy, self-hosted |

---

## 1. OpenAI

**Website:** [https://openai.com](https://openai.com)  
**API Docs:** [https://platform.openai.com/docs](https://platform.openai.com/docs)

### Model Terbaru

#### GPT-5.5 (Flagship)
- **Status:** Latest flagship
- **Best for:** Complex coding, multi-step reasoning, professional work
- **Context window:** 270K+ tokens (standard processing rates)
- **Cached input:** $0.50 / MTok
- **Pricing:** Input $5.00/MTok | Output $30.00/MTok
- **Special features:** Extended thinking, high-autonomy tasks

#### GPT-5.4
- **Status:** Available
- **Best for:** Coding & professional work (more affordable)
- **Pricing:** Input $2.50/MTok | Output $15.00/MTok
- **Cached input:** $0.25/MTok

#### GPT-5.4 mini
- **Status:** Available
- **Best for:** Sub-agents, computer use, coding
- **Pricing:** Input $0.75/MTok | Output $4.50/MTok
- **Cached input:** $0.075/MTok

#### GPT-Image-2
- **Best for:** State-of-the-art image generation
- **Pricing:** Image input $8.00/MTok, output $30.00/MTok
- **Cached input:** $2.00/MTok (image), $1.25/MTok (text)

#### GPT-Realtime-2
- **Best for:** Real-time voice interactions
- **Pricing:** Audio input $32.00/MTok, output $64.00/MTok

#### GPT-Realtime-Translate
- **Best for:** Live speech translation
- **Pricing:** $0.034/minute

#### GPT-Realtime-Whisper
- **Best for:** Streaming speech-to-text
- **Pricing:** $0.017/minute

### Recommended Use Cases in Project
| Use Case | Model |
|----------|-------|
| Chatbot dengan reasoning dalam | GPT-5.5 |
| Coding assistance | GPT-5.4 atau GPT-5.4 mini |
| Image generation | GPT-Image-2 |
| Voice interface | GPT-Realtime-2 |
| Cost-efficient tasks | GPT-5.4 mini |

---

## 2. Anthropic (Claude)

**Website:** [https://anthropic.com](https://anthropic.com)  
**API Docs:** [https://docs.anthropic.com](https://docs.anthropic.com) / [https://platform.claude.com/docs](https://platform.claude.com/docs)

### Model Terbaru

#### Claude Fable 5 ⭐
- **Status:** Generally available (June 9, 2026)
- **API ID:** `claude-fable-5`
- **Best for:** Most demanding reasoning, long-horizon agentic coding, high-autonomy work
- **Context window:** 1M tokens
- **Max output:** 128K tokens
- **Pricing:** Input $10/MTok | Output $50/MTok
- **Wave ID:** 5th generation
- **Knowledge cutoff:** Reliable Jan 2026
- **Available on:** Claude API, AWS Bedrock, Vertex AI, Microsoft Foundry

#### Claude Mythos 5
- **Status:** Limited availability (Project Glasswing)
- **API ID:** `claude-mythos-5`
- **Best for:** Defensive cybersecurity, research
- **Pricing:** Input $10/MTok | Output $50/MTok
- **Context:** 1M tokens
- **Note:** Invitation-only access

#### Claude Opus 4.8
- **API ID:** `claude-opus-4-8`
- **Best for:** Complex reasoning, agentic coding
- **Context:** 1M tokens (200K on Foundry)
- **Max output:** 128K tokens
- **Pricing:** Input $5/MTok | Output $25/MTok
- **Adaptive thinking:** Yes
- **Knowledge cutoff:** Jan 2026

#### Claude Sonnet 4.6
- **API ID:** `claude-sonnet-4-6`
- **Best for:** Best balance of speed & intelligence
- **Context:** 1M tokens
- **Pricing:** Input $3/MTok | Output $15/MTok
- **Extended thinking:** Yes
- **Adaptive thinking:** Yes

#### Claude Haiku 4.5
- **API ID:** `claude-haiku-4-5`
- **Best for:** Fastest model, near-frontier intelligence
- **Context:** 200K tokens
- **Pricing:** Input $1/MTok | Output $5/MTok
- **Extended thinking:** Yes

### Recommended Use Cases in Project
| Use Case | Model |
|----------|-------|
| Complex agentic coding | Claude Fable 5 atau Opus 4.8 |
| Balance speed & quality | Claude Sonnet 4.6 |
| High volume, low cost | Claude Haiku 4.5 |
| Long context processing | Claude Fable 5 (1M context) |

---

## 3. Google (Gemini)

**Website:** [https://ai.google.dev](https://ai.google.dev)  
**Model Docs:** [https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/google-models](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/google-models)

### Model Terbaru

#### Gemini 3.5 Flash (GA)
- **Status:** Generally Available
- **Best for:** Pro-level coding proficiency, parallel agentic execution
- **Context window:** 1M tokens
- **Features:** Near-Pro intelligence at Flash-tier cost & speed

#### Gemini 3.1 Flash-Lite (GA)
- **Status:** Generally Available
- **Best for:** High volume, cost-sensitive traffic
- **Context:** Large
- **Features:** Low latency, optimized efficiency

#### Gemini 2.5 Pro (GA)
- **Status:** Generally Available
- **Best for:** Complex reasoning, coding, multimodal
- **Context:** 1M tokens
- **Features:** Adaptive thinking

#### Gemini 2.5 Flash (GA)
- **Status:** Generally Available
- **Best for:** Balanced intelligence & latency
- **Features:** Controllable thinking budgets

#### Gemini 3.1 Pro (Preview)
- **Status:** Preview
- **Best for:** Complex agentic workflows, coding
- **Context:** 1M tokens
- **Features:** Adaptive thinking, integrated grounding

#### Gemini 3 Flash (Preview)
- **Status:** Preview
- **Best for:** Complex multimodal understanding, state-of-the-art reasoning

#### Gemma 4 (Open Model)
- **Status:** Available
- **Best for:** Self-hosted, text generation, coding, reasoning
- **Features:** Multimodal (text, image), audio for E2B/E4B variants
- **Open source:** Yes

### Recommended Use Cases in Project
| Use Case | Model |
|----------|-------|
| Multimodal processing | Gemini 2.5 Pro / 3.1 Pro |
| High volume text | Gemini 3.5 Flash |
| Low-cost high-volume | Gemini 3.1 Flash-Lite |
| Self-hosted AI | Gemma 4 (open model) |

---

## 4. Meta (Llama)

**Website:** [https://llama.meta.com](https://llama.meta.com)

### Model Terbaru

#### Llama 4
- **Status:** Latest generation
- **Parameters:** Multiple sizes (8B, 70B, 405B - estimates)
- **Context window:** Up to 1M tokens
- **License:** Open source (custom commercial license)
- **Modality:** Text + Image input
- **Best for:** Self-hosted deployment, fine-tuning, research

#### Llama 4 Scout
- **Best for:** Lightweight deployment
- **Context:** Up to 1M tokens (MoE architecture)

#### Llama 4 Maverick
- **Best for:** High performance, instruction following

#### Llama 4 Behemoth
- **Best for:** Training larger models (teacher model)

### Recommended Use Cases in Project
| Use Case | Model |
|----------|-------|
| Self-hosted AI inference | Llama 4 (any variant) |
| Fine-tuning for custom domain | Llama 4 (open weights) |
| Privacy-first applications | Llama 4 (local deployment) |
| High-throughput production | Llama 4 Scout |

---

## 5. DeepSeek

**Website:** [https://deepseek.com](https://deepseek.com)  
**API Platform:** [https://platform.deepseek.com](https://platform.deepseek.com)

### Model Terbaru

#### DeepSeek-V4 (Preview)
- **Status:** Preview (released early 2026)
- **Best for:** World-class reasoning, agent capabilities
- **Architecture:** 236B parameters
- **Context:** 64K tokens (API)
- **Pricing:** Input ~$0.14/MTok | Output ~$0.28/MTok (≈1元/2元 per million tokens)
- **Features:** OpenAI API compatible, FIM, Function Calling, JSON Output
- **Performance:** Rivals top closed-source models

#### DeepSeek-R1
- **Status:** Available
- **Best for:** Advanced reasoning, math, coding
- **Features:** Chain-of-thought reasoning, reinforcement learning trained

#### DeepSeek-V3
- **Status:** Available
- **Best for:** General-purpose, open-source alternative
- **Features:** Top of open-source benchmarks

### Recommended Use Cases in Project
| Use Case | Model |
|----------|-------|
| Extremely low-cost AI | DeepSeek-V4 |
| Reasoning-heavy tasks | DeepSeek-V4 / R1 |
| Self-hosted AI deployment | DeepSeek-V3 (open source) |
| Chinese language applications | DeepSeek-V4 (native CN support) |

---

## 6. Mistral AI

**Website:** [https://mistral.ai](https://mistral.ai)  
**Platform:** [https://console.mistral.ai](https://console.mistral.ai)

### Model Terbaru

#### Mistral Large (Latest)
- **Status:** Latest flagship
- **Best for:** Complex reasoning, coding, multilingual
- **Context:** 128K tokens
- **Features:** Function calling, JSON mode, agentic

#### Mistral Small
- **Best for:** Low-latency, high-volume tasks
- **Features:** Efficient, fast responses

#### Mistral Nemo
- **Best for:** Edge deployment, lightweight
- **Features:** 12B parameters, Apache 2.0 license

#### Mistral Platform (La Plateforme → Mistral Studio)
- **Platform:** Mistral Studio — build, deploy, govern agentic systems
- **Features:** Workflows, agents, connectors, experiments, guardrails, observability
- **Deployment:** Cloud, dedicated, self-hosted

### Recommended Use Cases in Project
| Use Case | Model |
|----------|-------|
| Enterprise AI platform | Mistral Studio |
| Self-hosted LLM | Mistral Nemo / Small |
| Multilingual apps | Mistral Large |
| Privacy-critical | Self-hosted option |

---

## 7. Cohere

**Website:** [https://cohere.com](https://cohere.com)  
**API Docs:** [https://docs.cohere.com](https://docs.cohere.com)

### Model Terbaru

#### Command A+ (Command-A-Plus-05-2026)
- **Status:** Live
- **Architecture:** Mixture of Experts (MoE) — 25B active / 218B total params
- **Context:** 128K
- **Best for:** Agentic tasks, reasoning, vision, multilingual (48 languages)
- **Deployment:** Single B200 or 2xH100
- **Features:** Vision input, thinking/reasoning mode

#### Command A
- **Best for:** Agentic workflows
- **Features:** Tool use, RAG

#### Command R7B
- **Best for:** Lightweight agentic tasks
- **Features:** Efficient deployment

#### Command A Vision
- **Best for:** Image + text understanding

#### Command A Reasoning
- **Best for:** Complex reasoning with Chain-of-Thought

#### Embed v3
- **Best for:** Text embeddings, semantic search
- **Features:** State-of-the-art retrieval

#### Rerank v3
- **Best for:** Search relevance, RAG optimization
- **Features:** Most cost-effective reranker

#### Cohere Transcribe
- **Best for:** Automatic speech recognition (ASR)

### Recommended Use Cases in Project
| Use Case | Model |
|----------|-------|
| Enterprise RAG pipeline | Command A + Embed + Rerank |
| Multilingual applications | Command A+ (48 languages) |
| Search optimization | Rerank |
| Vision + text tasks | Command A Vision / A+ |

---

## 8. xAI (Grok)

**Website:** [https://x.ai](https://x.ai)  
**API:** [https://console.x.ai](https://console.x.ai)

### Model Terbaru

#### Grok 3 / Grok-3
- **Status:** Latest version
- **Best for:** Real-time knowledge, reasoning, coding
- **Features:** Integrated with X (Twitter) data, real-time web access
- **Context:** Large (128K+)
- **Modality:** Text, vision

### Recommended Use Cases in Project
| Use Case | Model |
|----------|-------|
| Real-time data analysis | Grok (X/Twitter integration) |
| General reasoning | Grok |
| Research-heavy apps | Grok (real-time web access) |

---

## 9. AI21 Labs

**Website:** [https://ai21.com](https://ai21.com)

### Model Terbaru

#### Jamba 1.5 / Jamba 1.6
- **Status:** Latest generation
- **Best for:** Long context, hybrid SSM-Transformer architecture
- **Context:** Up to 256K tokens
- **Features:** Efficient long-context processing
- **Deployment:** API + self-hosted options

### Recommended Use Cases in Project
| Use Case | Model |
|----------|-------|
| Long document processing | Jamba (256K context) |
| Efficient inference | Jamba (hybrid architecture) |

---

## 10. Reka AI

**Website:** [https://reka.ai](https://reka.ai)

### Model Terbaru

#### Reka Core
- **Status:** Latest flagship
- **Best for:** Multimodal understanding, competitive with frontier models
- **Modality:** Text, image, video, audio
- **Features:** Multilingual, state-of-the-art on multimodal benchmarks

#### Reka Flash
- **Best for:** Efficient, faster inference

#### Reka Edge
- **Best for:** On-device deployment

### Recommended Use Cases in Project
| Use Case | Model |
|----------|-------|
| Multimodal applications | Reka Core |
| On-device AI | Reka Edge |

---

## 💡 Rekomendasi untuk Project Sainskerta

### Berdasarkan Budget

| Budget | Rekomendasi Provider | Model |
|--------|---------------------|-------|
| Rendah | DeepSeek | DeepSeek-V4 |
| Rendah | Anthropic | Claude Haiku 4.5 |
| Sedang | OpenAI | GPT-5.4 |
| Sedang | Anthropic | Claude Sonnet 4.6 |
| Tinggi | Anthropic | Claude Opus 4.8 / Fable 5 |
| Tinggi | OpenAI | GPT-5.5 |

### Berdasarkan Use Case

| Need | Provider | Model |
|------|----------|-------|
| Coding & development | Anthropic | Claude Opus 4.8 |
| General chatbot | OpenAI | GPT-5.4 |
| Self-hosted | Meta / DeepSeek | Llama 4 / DeepSeek-V3 |
| RAG pipeline | Cohere | Command A + Embed |
| Multimodal | Google | Gemini 2.5 Pro |
| Voice | OpenAI | GPT-Realtime-2 |
| Image generation | OpenAI | GPT-Image-2 |
| Long context processing | Anthropic | Claude Fable 5 (1M context) |
| Enterprise security | Mistral / Cohere | Self-hosted options |

---

## 🛠️ Integrasi di Project

Template `.env` untuk integrasi AI:

```bash
# Pilih provider yang digunakan
AI_PROVIDER=openic

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.4-mini

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6

# Google Gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash

# DeepSeek
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-chat

# Cohere
COHERE_API_KEY=...
COHERE_MODEL=command-a-plus
```

---

## 🔗 Referensi

- [TEMPLATE-ARCHITECTURE.md](../TEMPLATE-ARCHITECTURE.md) — Template tanya jawab AI provider
- [phases/01-PLANNING.md](../phases/01-PLANNING.md) — Fase planning integrasi AI
- [phases/03-BACKEND.md](../phases/03-BACKEND.md) — Implementasi backend dengan AI

> **Catatan:** Harga dan ketersediaan model dapat berubah sewaktu-waktu. Selalu cek dokumentasi resmi masing-masing provider untuk informasi terkini.
