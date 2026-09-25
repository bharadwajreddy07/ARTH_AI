"""
Arth AI - Python RAG micro-service backed by ChromaDB.

Collections
-----------
  rag_chunks      : general knowledge / news / ingested documents
  user_profiles   : login / user preference data per user_id
  portfolio_data  : portfolio holdings data per user_id

Endpoints
---------
  GET  /health            - liveness
  GET  /status            - detailed status
  POST /ingest            - ingest generic RAG documents
  POST /ingest_user       - ingest / update a user profile document
  POST /ingest_portfolio  - ingest / update portfolio holdings for a user
  POST /search            - semantic search across rag_chunks
  POST /search_user       - search user-specific RAG context (profile + portfolio)
  DELETE /clear           - drop and recreate the rag_chunks collection
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

# optional sentence-transformers
try:
    from sentence_transformers import SentenceTransformer
    _ST_AVAILABLE = True
except ImportError:
    SentenceTransformer = None  # type: ignore[misc,assignment]
    _ST_AVAILABLE = False

# ChromaDB
try:
    import chromadb
    from chromadb.config import Settings
    _CHROMA_AVAILABLE = True
except ImportError:
    chromadb = None  # type: ignore[assignment]
    Settings = None  # type: ignore[assignment,misc]
    _CHROMA_AVAILABLE = False

# configuration
ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
CHROMA_DIR = Path(os.getenv("CHROMA_DB_PATH", str(DATA_DIR / "chromadb")))
MODEL_NAME = os.getenv("RAG_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
HOST = os.getenv("RAG_PYTHON_HOST", "127.0.0.1")
PORT = int(os.getenv("RAG_PYTHON_PORT", "5100"))
TOP_K = max(2, int(os.getenv("RAG_TOP_K", "4")))

# Collection names
COL_RAG = "rag_chunks"
COL_USERS = "user_profiles"
COL_PORTFOLIO = "portfolio_data"

# globals
_MODEL = None
_CHROMA_CLIENT = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256(text: str, length: int = 32) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:length]


# embedding

def _load_model():
    global _MODEL
    if _MODEL is None and _ST_AVAILABLE:
        _MODEL = SentenceTransformer(MODEL_NAME)
    return _MODEL


def _fallback_embed(text: str, dim: int = 384) -> list:
    """Simple hash-based fallback embedding when sentence-transformers absent."""
    vector = [0.0] * dim
    for i, token in enumerate(text.lower().split()):
        digest = hashlib.sha256(f"{token}:{i}".encode()).digest()
        vector[int.from_bytes(digest[:4], "big") % dim] += 1.0
    total = sum(v * v for v in vector) ** 0.5
    return [v / total for v in vector] if total else vector


def embed(texts: list) -> list:
    model = _load_model()
    if model is not None:
        return model.encode(texts, normalize_embeddings=True).tolist()
    return [_fallback_embed(t) for t in texts]


# ChromaDB client

def get_client():
    global _CHROMA_CLIENT
    if _CHROMA_CLIENT is None:
        if not _CHROMA_AVAILABLE:
            raise RuntimeError("chromadb package not installed. Run: pip install chromadb")
        CHROMA_DIR.mkdir(parents=True, exist_ok=True)
        _CHROMA_CLIENT = chromadb.PersistentClient(
            path=str(CHROMA_DIR),
            settings=Settings(anonymized_telemetry=False),
        )
    return _CHROMA_CLIENT


def _get_collection(name: str):
    """Get or create a ChromaDB collection."""
    client = get_client()
    return client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"},
    )


# ---------------------------------------------------------------------------
# RAG chunks  (general knowledge / news / ingested docs)
# ---------------------------------------------------------------------------

def _doc_id(source: str, title: str, content: str, extra: str = "") -> str:
    raw = f"{source}|{title}|{content[:200]}|{extra}"
    return _sha256(raw)


def ingest(documents: list) -> dict:
    valid = [d for d in documents if str(d.get("content", "")).strip()]
    if not valid:
        return {"inserted": 0, "totalDocuments": count_rag(), "model": MODEL_NAME, "store": "chromadb"}

    col = _get_collection(COL_RAG)
    texts = [f"{d.get('title', '')}\n{d.get('content', '')}" for d in valid]
    vectors = embed(texts)

    ids, embeddings_list, metadatas, documents_list = [], [], [], []
    for doc, vec in zip(valid, vectors):
        doc_id = doc.get("id") or _doc_id(
            str(doc.get("source", "python-rag")),
            str(doc.get("title", "Untitled")),
            str(doc.get("content", "")),
        )
        ids.append(doc_id)
        embeddings_list.append(vec)
        metadatas.append({
            "source": str(doc.get("source", "python-rag")),
            "title": str(doc.get("title", "Untitled")),
            "published_at": str(doc.get("publishedAt") or doc.get("date") or ""),
            "ingested_at": str(doc.get("ingestedAt") or utc_now()),
            "metadata_json": json.dumps(doc.get("metadata") or {}),
        })
        documents_list.append(str(doc.get("content", "")))

    col.upsert(ids=ids, embeddings=embeddings_list, metadatas=metadatas, documents=documents_list)
    return {"inserted": len(valid), "totalDocuments": count_rag(), "model": MODEL_NAME, "store": "chromadb"}


def count_rag() -> int:
    try:
        return _get_collection(COL_RAG).count()
    except Exception:
        return 0


def search(query: str, limit: int = TOP_K, user_id=None) -> list:
    if not query.strip():
        return []
    col = _get_collection(COL_RAG)
    if col.count() == 0:
        return []

    query_vec = embed([query])[0]

    results = col.query(
        query_embeddings=[query_vec],
        n_results=max(1, limit),
        include=["documents", "metadatas", "distances"],
    )

    out = []
    docs = results.get("documents", [[]])[0] or []
    metas = results.get("metadatas", [[]])[0] or []
    dists = results.get("distances", [[]])[0] or []

    for i, doc_content in enumerate(docs):
        meta = metas[i] if i < len(metas) else {}
        dist = dists[i] if i < len(dists) else 1.0
        score = round(max(0.0, 1.0 - dist), 4)
        out.append({
            "source": meta.get("source", "chromadb"),
            "title": meta.get("title", ""),
            "content": doc_content,
            "publishedAt": meta.get("published_at") or None,
            "ingestedAt": meta.get("ingested_at"),
            "score": score,
        })
    return sorted(out, key=lambda x: x["score"], reverse=True)


def clear_rag() -> dict:
    client = get_client()
    try:
        client.delete_collection(COL_RAG)
    except Exception:
        pass
    _get_collection(COL_RAG)  # recreate
    return {"cleared": True, "store": "chromadb"}


# ---------------------------------------------------------------------------
# User profiles  (login / preferences stored as embeddings)
# ---------------------------------------------------------------------------

def ingest_user(user_id: str, user_data: dict) -> dict:
    """
    Store / update a user profile document in ChromaDB.
    The document text is constructed from login details and preferences so it
    can be semantically retrieved and injected as RAG context.
    """
    if not user_id:
        return {"error": "user_id is required"}

    col = _get_collection(COL_USERS)

    name = str(user_data.get("name") or "")
    email = str(user_data.get("email") or "")
    goals = user_data.get("investmentGoals") or []
    if isinstance(goals, list):
        goals_text = ", ".join(str(g) for g in goals)
    else:
        goals_text = str(goals)

    created_at = str(user_data.get("createdAt") or "")

    content = (
        f"User profile for {name} (email: {email}). "
        f"Investment goals: {goals_text or 'not specified'}. "
        f"Member since: {created_at or 'unknown'}."
    )

    vec = embed([content])[0]
    doc_id = f"user-{_sha256(user_id, 16)}"

    col.upsert(
        ids=[doc_id],
        embeddings=[vec],
        documents=[content],
        metadatas=[{
            "user_id": user_id,
            "name": name,
            "email": email,
            "investment_goals": goals_text,
            "created_at": created_at,
            "updated_at": utc_now(),
            "type": "user_profile",
        }],
    )
    return {"stored": True, "user_id": user_id, "doc_id": doc_id, "store": "chromadb"}


def search_user_profile(user_id: str, query: str, limit: int = TOP_K) -> list:
    """Return user-specific RAG context: profile + portfolio."""
    results = []

    # User profile
    try:
        col = _get_collection(COL_USERS)
        if col.count() > 0:
            q_vec = embed([query])[0]
            r = col.query(
                query_embeddings=[q_vec],
                n_results=2,
                where={"user_id": {"$eq": user_id}},
                include=["documents", "metadatas", "distances"],
            )
            rdocs = r.get("documents", [[]])[0] or []
            rmetas = r.get("metadatas", [[]])[0] or []
            rdists = r.get("distances", [[]])[0] or []
            for i, doc_content in enumerate(rdocs):
                meta = rmetas[i] if i < len(rmetas) else {}
                dist = rdists[i] if i < len(rdists) else 1.0
                results.append({
                    "source": "user-profile",
                    "title": f"Profile: {meta.get('name', user_id)}",
                    "content": doc_content,
                    "score": round(max(0.0, 1.0 - dist), 4),
                })
    except Exception:
        pass

    # Portfolio
    try:
        pcol = _get_collection(COL_PORTFOLIO)
        if pcol.count() > 0:
            q_vec2 = embed([query])[0]
            pr = pcol.query(
                query_embeddings=[q_vec2],
                n_results=limit,
                where={"user_id": {"$eq": user_id}},
                include=["documents", "metadatas", "distances"],
            )
            pdocs = pr.get("documents", [[]])[0] or []
            pmetas = pr.get("metadatas", [[]])[0] or []
            pdists = pr.get("distances", [[]])[0] or []
            for i, doc_content in enumerate(pdocs):
                meta = pmetas[i] if i < len(pmetas) else {}
                dist = pdists[i] if i < len(pdists) else 1.0
                results.append({
                    "source": "user-portfolio",
                    "title": meta.get("title", "Portfolio holding"),
                    "content": doc_content,
                    "score": round(max(0.0, 1.0 - dist), 4),
                })
    except Exception:
        pass

    return sorted(results, key=lambda x: x["score"], reverse=True)[:limit]


# ---------------------------------------------------------------------------
# Portfolio data  (holdings stored as embeddings)
# ---------------------------------------------------------------------------

def ingest_portfolio(user_id: str, portfolio_data: dict) -> dict:
    """
    Store portfolio holdings for a user in ChromaDB.
    Each holding becomes a separate document for fine-grained retrieval.
    A summary document for the whole portfolio is also stored.
    """
    if not user_id:
        return {"error": "user_id is required"}

    col = _get_collection(COL_PORTFOLIO)
    holdings = portfolio_data.get("holdings") or []
    total_invested = float(portfolio_data.get("totalInvested") or 0)
    current_value = float(portfolio_data.get("currentValue") or 0)
    pnl = current_value - total_invested
    pnl_pct = (pnl / total_invested * 100) if total_invested else 0

    ids, vecs, metas, docs = [], [], [], []

    # Per-holding documents
    for h in holdings:
        symbol = str(h.get("symbol") or "")
        name = str(h.get("name") or symbol)
        asset_type = str(h.get("type") or "stock")
        qty = float(h.get("quantity") or 0)
        avg_price = float(h.get("avgBuyPrice") or 0)
        cur_price = float(h.get("currentPrice") or avg_price)
        invested = qty * avg_price
        cur_val = qty * cur_price
        h_pnl = cur_val - invested
        h_pnl_pct = (h_pnl / invested * 100) if invested else 0
        purchase_date = str(h.get("purchaseDate") or "")

        content = (
            f"Holding: {name} ({symbol}), type: {asset_type}. "
            f"Quantity: {qty}, average buy price: Rs.{avg_price:.2f}, "
            f"current price: Rs.{cur_price:.2f}. "
            f"Total invested: Rs.{invested:.2f}, current value: Rs.{cur_val:.2f}. "
            f"P&L: Rs.{h_pnl:.2f} ({h_pnl_pct:.2f}%). "
            f"Purchase date: {purchase_date or 'unknown'}."
        )

        doc_id = f"portfolio-{_sha256(user_id, 8)}-{_sha256(symbol + asset_type, 8)}"
        ids.append(doc_id)
        vecs.append(embed([content])[0])
        metas.append({
            "user_id": user_id,
            "symbol": symbol,
            "name": name,
            "type": asset_type,
            "title": f"Portfolio: {name} ({symbol})",
            "updated_at": utc_now(),
            "record_type": "holding",
        })
        docs.append(content)

    # Portfolio summary document
    symbols_list = ", ".join(str(h.get("symbol", "")) for h in holdings) or "none"
    summary_content = (
        f"Portfolio summary for user {user_id}. "
        f"Total invested: Rs.{total_invested:.2f}, current value: Rs.{current_value:.2f}. "
        f"Overall P&L: Rs.{pnl:.2f} ({pnl_pct:.2f}%). "
        f"Holdings: {symbols_list}."
    )
    summary_id = f"portfolio-summary-{_sha256(user_id, 16)}"
    ids.append(summary_id)
    vecs.append(embed([summary_content])[0])
    metas.append({
        "user_id": user_id,
        "title": "Portfolio summary",
        "updated_at": utc_now(),
        "record_type": "summary",
        "symbol": "__summary__",
        "name": "Portfolio summary",
        "type": "summary",
    })
    docs.append(summary_content)

    if ids:
        col.upsert(ids=ids, embeddings=vecs, metadatas=metas, documents=docs)

    return {
        "stored": True,
        "user_id": user_id,
        "holdingsIndexed": len(holdings),
        "totalDocs": len(ids),
        "store": "chromadb",
    }


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

def status() -> dict:
    info = {
        "provider": "chromadb",
        "chromaPath": str(CHROMA_DIR),
        "model": MODEL_NAME,
        "modelLoaded": _MODEL is not None,
        "modelAvailable": _ST_AVAILABLE,
        "chromaAvailable": _CHROMA_AVAILABLE,
    }
    try:
        info["collections"] = {
            COL_RAG: count_rag(),
            COL_USERS: _get_collection(COL_USERS).count(),
            COL_PORTFOLIO: _get_collection(COL_PORTFOLIO).count(),
        }
    except Exception as exc:
        info["collectionsError"] = str(exc)
    return info


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    def _respond(self, payload: dict, code: int = 200) -> None:
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self) -> None:
        path = self.path.split("?")[0]
        if path == "/health":
            self._respond({"status": "ok", **status()})
        elif path == "/status":
            self._respond(status())
        else:
            self._respond({"error": "Not found"}, 404)

    def do_POST(self) -> None:
        path = self.path.split("?")[0]
        try:
            payload = self._read_body()

            if path == "/ingest":
                self._respond(ingest(payload.get("documents", [])))

            elif path == "/ingest_user":
                user_id = str(payload.get("userId") or payload.get("user_id") or "")
                user_data = payload.get("user") or payload.get("userData") or {}
                self._respond(ingest_user(user_id, user_data))

            elif path == "/ingest_portfolio":
                user_id = str(payload.get("userId") or payload.get("user_id") or "")
                portfolio = payload.get("portfolio") or payload.get("portfolioData") or {}
                self._respond(ingest_portfolio(user_id, portfolio))

            elif path == "/search":
                query = str(payload.get("query", ""))
                limit = int(payload.get("limit", TOP_K))
                user_id = payload.get("userId") or payload.get("user_id")
                results = search(query, limit)
                if user_id:
                    user_ctx = search_user_profile(str(user_id), query, 3)
                    results = user_ctx + results
                self._respond({"results": results[:limit]})

            elif path == "/search_user":
                user_id = str(payload.get("userId") or payload.get("user_id") or "")
                query = str(payload.get("query", ""))
                limit = int(payload.get("limit", TOP_K))
                self._respond({"results": search_user_profile(user_id, query, limit)})

            elif path == "/clear":
                self._respond(clear_rag())

            else:
                self._respond({"error": "Not found"}, 404)

        except Exception as exc:
            self._respond({"error": str(exc)}, 500)

    def do_DELETE(self) -> None:
        path = self.path.split("?")[0]
        try:
            if path == "/clear":
                self._respond(clear_rag())
            else:
                self._respond({"error": "Not found"}, 404)
        except Exception as exc:
            self._respond({"error": str(exc)}, 500)

    def log_message(self, *_args: Any) -> None:
        return


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    # Warm up ChromaDB collections
    try:
        _get_collection(COL_RAG)
        _get_collection(COL_USERS)
        _get_collection(COL_PORTFOLIO)
        print(f"[ChromaDB] Collections ready at {CHROMA_DIR}")
    except Exception as exc:
        print(f"[ChromaDB] Warning: {exc}")

    print(f"[RAG] Starting on {HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
