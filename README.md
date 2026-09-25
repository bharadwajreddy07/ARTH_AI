# Arth – Intelligent Financial Co-pilot 🚀

> Bridging market data and actionable insight for Indian retail investors.  
> Built with MERN + Python ChromaDB-backed RAG + Vite.

---

## ✨ Features

| Feature | Description |
|---|---|
| 📈 **Live Market Data** | NSE/BSE quotes, indices (Nifty, Sensex, Bank Nifty), top gainers/losers |
| 📉 **F&O + Bonds** | India-focused futures/options snapshot and bond yield view |
| 🤖 **AI Chat (RAG)** | Groq/OpenAI-compatible assistant with personalized ChromaDB context |
| 📊 **Stock Analysis** | AI-generated technical + fundamental breakdowns per stock |
| 📰 **News + Sentiment** | India-focused live news with automatic bullish/bearish sentiment scoring |
| 💼 **Portfolio Tracker** | Holdings, live P&L, allocation pie chart — auto-indexed into ChromaDB |
| ⭐ **Watchlist** | Track favourite stocks with live price updates |
| 🏦 **Mutual Funds** | Search, compare, track NAV via MFAPI.in |
| 🔐 **Auth** | JWT-based register/login — user profiles auto-indexed into ChromaDB |
| 🧠 **Personalized RAG** | Login + portfolio data stored as vector embeddings for context-aware AI |

---

## 🏗️ Tech Stack

| Layer | Technologies |
|---|---|
| **Backend** | Node.js · Express · MongoDB (Mongoose) · Redis + node-cache · JWT |
| **Frontend** | React 18 · **Vite 5** · React Router 6 · Recharts · Lucide Icons · Framer Motion |
| **AI / LLM** | Groq · OpenAI-compatible APIs · Hugging Face Router · Rule-based fallback |
| **RAG / Embeddings** | Python · sentence-transformers (`all-MiniLM-L6-v2`) · **ChromaDB** (persistent) |
| **Market Data** | Yahoo Finance · Alpha Vantage · FMP/Polygon · MFAPI.in · Finnhub · NewsAPI |

---

## 🧠 ChromaDB RAG — How It Works

The Python micro-service (`backend/python/rag_service.py`) uses **ChromaDB** as the persistent vector database, replacing the old SQLite store. Three collections are maintained automatically:

| Collection | What's stored | When updated |
|---|---|---|
| `rag_chunks` | General knowledge, news, ingested docs | Every AI query / manual ingest |
| `user_profiles` | Login details, name, investment goals | Register · Login · Profile update |
| `portfolio_data` | Holdings, prices, P&L per user | Add/remove holding · Portfolio fetch |

**Data flow:**

```
User logs in  →  auth route  →  ingestUser()  →  POST /ingest_user  →  user_profiles collection
User portfolio saved  →  portfolio route  →  ingestPortfolio()  →  POST /ingest_portfolio  →  portfolio_data collection
AI query  →  ragService.js  →  POST /search (with userId)  →  Python merges rag_chunks + user context
```

The Node.js backend auto-starts the Python service on boot — no manual step needed.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+
- **Python** 3.10+
- **MongoDB** running locally (or a MongoDB Atlas URI)
- _(Optional)_ Redis for production caching

### 1. Clone & install

```bash
git clone <repo-url>
cd arth
```

### 2. Backend setup

```bash
cd backend

# Install Python RAG dependencies (ChromaDB + sentence-transformers)
python -m pip install -r python/requirements.txt

# Configure environment
cp .env.example .env          # edit and add your API keys

# Install Node dependencies and start
npm install
npm run dev                   # → http://localhost:5000
```

The Node server automatically spawns `python/rag_service.py` on startup. ChromaDB data is persisted to `backend/data/chromadb/`.

### 3. Frontend setup (new terminal)

```bash
cd frontend
cp .env.example .env          # optional – proxy is pre-configured
npm install
npm run dev                   # → http://localhost:3000
```

### 4. Run both from the project root (optional)

```bash
# From repo root
npm install
npm run dev
```

---

## 🔑 Environment Variables

### Backend — `backend/.env`

```env
# Server
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database
MONGODB_URI=mongodb://localhost:27017/arth
REDIS_URL=redis://localhost:6379         # optional

# Auth
JWT_SECRET=replace_with_strong_random_secret
JWT_EXPIRE=7d

# AI — Groq (recommended, fastest)
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile

# AI — OpenAI (alternative)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# AI — Hugging Face Router (alternative)
HF_TOKEN=hf_...
OPENAI_BASE_URL=https://router.huggingface.co/v1

# RAG / Python service
RAG_MODEL=sentence-transformers/all-MiniLM-L6-v2
RAG_TOP_K=4
RAG_PYTHON_URL=http://127.0.0.1:5100
RAG_PYTHON_PORT=5100
RAG_PYTHON_AUTOSTART=true
PYTHON_BIN=python3

# ChromaDB — persistent vector store path
CHROMA_DB_PATH=backend/data/chromadb

# Hugging Face FinBERT sentiment (optional)
HF_API_KEY=hf_...
FINBERT_MODEL=ProsusAI/finbert

# Market data providers (all have free tiers)
ALPHA_VANTAGE_API_KEY=...
FMP_API_KEY=...
POLYGON_API_KEY=...
FINNHUB_API_KEY=...
NEWS_API_KEY=...
```

### Frontend — `frontend/.env`

```env
# Optional – leave empty to use the built-in Vite proxy (/api → :5000)
# VITE_API_URL=http://localhost:5000/api

VITE_APP_NAME=Arth
```

> **Limited mode:** The app works without API keys using fallback data. Add keys progressively to enable live market data and AI features.

---

## 📁 Project Structure

```
arth/
├── backend/
│   ├── data/
│   │   └── chromadb/             ← ChromaDB persistent vector store (auto-created)
│   ├── middleware/
│   │   └── auth.js               ← JWT middleware
│   ├── models/                   ← Mongoose schemas (User, Portfolio, Watchlist)
│   ├── python/
│   │   ├── rag_service.py        ← Python ChromaDB RAG micro-service
│   │   └── requirements.txt      ← chromadb + sentence-transformers
│   ├── routes/
│   │   ├── auth.js               ← Register/login → syncs user to ChromaDB
│   │   ├── portfolio.js          ← Portfolio CRUD → syncs holdings to ChromaDB
│   │   ├── ai.js                 ← AI endpoints
│   │   ├── stocks.js
│   │   ├── mutualFunds.js
│   │   ├── news.js
│   │   └── watchlist.js
│   ├── services/
│   │   ├── aiService.js          ← LLM orchestration (Groq/OpenAI/HF)
│   │   ├── ragService.js         ← RAG retrieval + Qdrant + keyword ranking
│   │   ├── pythonRagClient.js    ← HTTP client for the Python ChromaDB service
│   │   ├── stockService.js
│   │   ├── newsService.js
│   │   ├── mfService.js
│   │   ├── sentimentService.js
│   │   └── cache.js
│   ├── .env.example
│   └── server.js
│
├── frontend/
│   ├── src/
│   │   ├── pages/                ← Route pages (Dashboard, Stocks, StockDetail, …)
│   │   ├── components/           ← Reusable UI (Sidebar, Topbar, StockCard, …)
│   │   ├── context/              ← AuthContext
│   │   ├── utils/
│   │   │   ├── api.js            ← Axios API client (VITE_ env vars)
│   │   │   └── format.js         ← Number/date helpers
│   │   ├── styles/
│   │   │   └── globals.css       ← Design system / CSS variables
│   │   └── main.jsx              ← Vite entry point
│   ├── public/
│   │   └── index.html            ← Static HTML fallback
│   ├── index.html                ← Vite root HTML (module script entry)
│   ├── vite.config.js            ← Vite config (proxy, JSX loader, port 3000)
│   ├── .env.example
│   └── package.json
│
├── package.json                  ← Root workspace scripts
└── README.md
```

---

## 🗺️ API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register new user _(syncs profile to ChromaDB)_ |
| POST | `/api/auth/login` | Login _(re-syncs profile to ChromaDB)_ |
| GET  | `/api/auth/me` | Current user (auth required) |
| PUT  | `/api/auth/profile` | Update profile _(syncs updated goals to ChromaDB)_ |

### Stocks
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/stocks/quote/:symbol` | Live quote |
| GET | `/api/stocks/quote-both/:symbol` | NSE/BSE dual quote snapshot |
| GET | `/api/stocks/history/:symbol?period=3mo` | Historical OHLCV |
| GET | `/api/stocks/search?q=reliance` | Symbol search |
| GET | `/api/stocks/gainers` | Top gainers |
| GET | `/api/stocks/losers` | Top losers |
| GET | `/api/stocks/indices` | Nifty / Sensex / Bank Nifty |
| GET | `/api/stocks/fno` | F&O educational market snapshot |
| GET | `/api/stocks/bonds` | India-focused bond snapshot |

### AI
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/ai/chat` | Chat with Arth AI (RAG-enriched) |
| GET  | `/api/ai/analyze/:symbol` | AI stock analysis |
| GET  | `/api/ai/analyze-realtime/:symbol` | Realtime deep analysis |
| GET  | `/api/ai/analyze-mf/:code` | Mutual fund analysis |
| POST | `/api/ai/compare` | Compare multiple assets |
| POST | `/api/ai/forecast` | Scenario-based forecast |
| GET  | `/api/ai/status` | AI provider status |
| GET  | `/api/ai/rag/status` | ChromaDB RAG runtime status |
| GET  | `/api/ai/rag/documents` | List ingested RAG documents |
| POST | `/api/ai/rag/ingest` | Ingest custom RAG documents |
| DELETE | `/api/ai/rag/documents` | Clear ingested RAG documents |

### Python ChromaDB Service (internal — port 5100)
| Method | Path | Description |
|---|---|---|
| POST | `/ingest` | Ingest documents into `rag_chunks` |
| POST | `/ingest_user` | Upsert user profile into `user_profiles` |
| POST | `/ingest_portfolio` | Upsert portfolio into `portfolio_data` |
| POST | `/search` | Semantic search (user-context-aware) |
| POST | `/search_user` | Retrieve user-specific RAG context |
| DELETE | `/clear` | Reset `rag_chunks` collection |
| GET | `/health` | Liveness check |
| GET | `/status` | Collection counts + model info |

### Portfolio / Watchlist
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/portfolio` | Get portfolio _(syncs to ChromaDB)_ |
| POST | `/api/portfolio/holding` | Add holding _(syncs to ChromaDB)_ |
| DELETE | `/api/portfolio/holding/:symbol` | Remove holding _(syncs to ChromaDB)_ |
| GET | `/api/portfolio/analytics` | Portfolio analytics + chart history |
| GET | `/api/watchlist` | Get watchlist |
| POST | `/api/watchlist/add` | Add to watchlist |
| DELETE | `/api/watchlist/remove/:symbol` | Remove from watchlist |

### Providers
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/providers/status` | Aggregated provider readiness (AI, market, news) |

---

## 🛣️ Roadmap

- [ ] WebSocket for real-time price streaming
- [ ] FinBERT integration for production-grade sentiment
- [ ] SEBI docs & earnings call ingestion into ChromaDB
- [ ] SIP calculator & goal planner
- [ ] Tax P&L report (FIFO cost basis)
- [ ] Mobile app (React Native)
- [ ] Portfolio back-testing engine
- [ ] Multi-user ChromaDB namespace isolation

---

## ⚠️ Disclaimer

Arth is an **educational tool only**. Nothing in this application constitutes financial advice.  
Always consult a SEBI-registered investment advisor before making investment decisions.
