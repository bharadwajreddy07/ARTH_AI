# Arth – Intelligent Financial Co-pilot 🚀

> Bridging market data and actionable insight for Indian retail investors.  
> Built with MERN + AI (RAG + LLMs).

---

## ✨ Features

| Feature | Description |
|---|---|
| 📈 **Live Market Data** | NSE/BSE quotes, indices (Nifty, Sensex, Bank Nifty), top gainers/losers |
| 📉 **F&O + Bonds** | India-focused futures/options snapshot and bond yield view |
| 🤖 **AI Chat (RAG)** | Groq/OpenAI-compatible powered assistant with Indian market context |
| 📊 **Stock Analysis** | AI-generated technical + fundamental breakdowns per stock |
| 📰 **News + Sentiment** | India-focused live news with automatic bullish/bearish sentiment scoring |
| 💼 **Portfolio Tracker** | Holdings, live P&L, allocation pie chart |
| ⭐ **Watchlist** | Track favourite stocks with live price updates |
| 🏦 **Mutual Funds** | Search, compare, track NAV via MFAPI.in |
| 🔐 **Auth** | JWT-based register/login with secure profile management |

---

## 🏗️ Tech Stack

**Backend:** Node.js · Express · MongoDB (Mongoose) · Redis + node-cache · JWT  
**Frontend:** React 18 · React Router 6 · Recharts · Lucide Icons  
**AI:** Groq + OpenAI-compatible APIs · RAG context injection · Rule-based fallback  
**Data:** Yahoo Finance (yahoo-finance2) · Alpha Vantage · FMP/Polygon (optional fundamentals) · MFAPI.in · Finnhub · NewsAPI  
**DevOps:** Docker · Docker Compose · Nginx (SPA serve + API proxy)

---

## 🚀 Quick Start

### Option 1 — Docker (Recommended)

```bash
# Clone and enter project
git clone <repo-url> && cd arth

# Create .env with your API keys
cp .env.example .env  # root-level file used by docker-compose

# Start everything
docker-compose up --build
```

Open **http://localhost:3000**

### Option 2 — Local Development

**Prerequisites:** Node 18+, MongoDB running locally

```bash
# 1. Backend
cd backend
cp .env.example .env        # add your API keys
npm install
npm run dev                 # → http://localhost:5000

# 2. Frontend (new terminal)
cd frontend
cp .env.example .env
npm install
npm start                   # → http://localhost:3000
```

### Root Workspace Scripts

You can now run both apps from the project root:

```bash
npm install
npm run dev
```

Available separated build scripts from root:

```bash
npm run build:frontend        # React production build
npm run build:backend         # Backend runtime check (no compile step)
npm run build:docker:frontend # Docker image build for frontend
npm run build:docker:backend  # Docker image build for backend
```

---

## 🔑 API Keys Setup

For local development, create `backend/.env` from `backend/.env.example`:

```env
MONGODB_URI=mongodb://localhost:27017/arth
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_super_secret_here

# Core AI (Groq recommended)
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
OPENAI_API_KEY=
OPENAI_BASE_URL=
HF_TOKEN=
OPENAI_MODEL=llama-3.3-70b-versatile
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
RAG_USE_EMBEDDINGS=false
RAG_TOP_K=4

# Optional FinBERT sentiment via Hugging Face
HF_API_KEY=hf_...
FINBERT_MODEL=ProsusAI/finbert

# Market data — all have free tiers
RAPIDAPI_KEY=...            # yahoo-finance15 on RapidAPI
FINNHUB_API_KEY=...         # finnhub.io
NEWS_API_KEY=...            # newsapi.org
ALPHA_VANTAGE_API_KEY=...   # alphavantage.co
```

For Hugging Face Router (OpenAI-compatible), set:

```env
OPENAI_BASE_URL=https://router.huggingface.co/v1
HF_TOKEN=hf_...
OPENAI_MODEL=moonshotai/Kimi-K2-Instruct-0905
```

For Docker Compose, set the same variables in the root `.env` file.

> **Limited mode:** The app works without API keys using realistic fallback data.  
> Add keys progressively to enable live data and AI.

---

## 📁 Project Structure

```
arth/
├── backend/
│   ├── models/          # Mongoose schemas (User, Portfolio, Watchlist)
│   ├── routes/          # Express routes (auth, stocks, mf, news, ai, portfolio)
│   ├── services/        # Business logic (stockService, mfService, aiService, newsService, cache)
│   ├── middleware/       # JWT auth middleware
│   └── server.js        # Express app entry point
│
├── frontend/
│   ├── src/
│   │   ├── pages/       # Route-level pages (Dashboard, Stocks, StockDetail, ...)
│   │   ├── components/  # Reusable UI (StockCard, NewsCard, PriceChart, Sidebar, ...)
│   │   ├── context/     # AuthContext
│   │   ├── utils/       # api.js (axios), format.js (helpers)
│   │   └── styles/      # globals.css (design system)
│   └── public/
│
├── docker-compose.yml
└── README.md
```

---

## 🗺️ API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| GET  | `/api/auth/me` | Current user (auth required) |

### Stocks
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/stocks/quote/:symbol` | Live quote |
| GET | `/api/stocks/quote-both/:symbol` | NSE/BSE dual quote snapshot |
| GET | `/api/stocks/history/:symbol?period=3mo` | Historical OHLCV |
| GET | `/api/stocks/search?q=reliance` | Search |
| GET | `/api/stocks/gainers` | Top gainers |
| GET | `/api/stocks/indices` | Nifty / Sensex / Bank Nifty |
| GET | `/api/stocks/fno` | F&O educational market snapshot |
| GET | `/api/stocks/bonds` | India-focused bond snapshot |

### AI
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/ai/chat` | Chat with Arth AI |
| GET  | `/api/ai/analyze/:symbol` | AI stock analysis |
| GET  | `/api/ai/analyze-realtime/:symbol` | Realtime analysis alias |
| POST | `/api/ai/compare` | Compare multiple assets |
| POST | `/api/ai/forecast` | Scenario-based forecast |
| GET  | `/api/ai/rag/status` | RAG runtime and ingestion status |
| GET  | `/api/ai/rag/documents` | List ingested RAG documents |
| POST | `/api/ai/rag/ingest` | Ingest custom RAG documents |
| DELETE | `/api/ai/rag/documents` | Clear ingested RAG documents |

### Providers
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/providers/status` | Aggregated provider readiness (AI, market/fundamentals, news) |

### Portfolio / Watchlist
| Method | Endpoint | |
|---|---|---|
| GET/POST | `/api/portfolio` | Get / add holdings |
| DELETE | `/api/portfolio/holding/:symbol` | Remove holding |
| GET/POST | `/api/watchlist` | Get / add to watchlist |
| DELETE | `/api/watchlist/remove/:symbol` | Remove |

---

## 🛣️ Roadmap

- [ ] WebSocket for real-time price streaming
- [ ] FinBERT integration for production-grade sentiment
- [ ] Pinecone vector DB for full RAG over SEBI docs & earnings calls
- [ ] SIP calculator & goal planner
- [ ] Tax P&L report (FIFO cost basis)
- [ ] Mobile app (React Native)
- [ ] Portfolio back-testing engine

---

## ⚠️ Disclaimer

Arth is an **educational tool only**. Nothing in this application constitutes financial advice.  
Always consult a SEBI-registered investment advisor before making investment decisions.
