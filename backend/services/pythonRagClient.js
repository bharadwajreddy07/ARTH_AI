/**
 * Client for the Python ChromaDB RAG micro-service.
 *
 * Endpoints proxied:
 *   POST /ingest            - ingest generic RAG documents into rag_chunks
 *   POST /ingest_user       - store user profile in user_profiles collection
 *   POST /ingest_portfolio  - store portfolio holdings in portfolio_data collection
 *   POST /search            - semantic search (optionally user-aware)
 *   POST /search_user       - user-specific RAG context (profile + portfolio)
 *   DELETE /clear           - reset rag_chunks collection
 *   GET  /health            - liveness check
 *   GET  /status            - detailed service status
 */

const { spawn } = require('child_process');
const path = require('path');
const axios = require('axios');

const baseURL = String(process.env.RAG_PYTHON_URL || 'http://127.0.0.1:5100').replace(/\/$/, '');
const pythonCommand = process.env.PYTHON_BIN || 'python3';
let serviceProcess;
let startAttempted = false;

const startPythonService = () => {
  if (startAttempted || process.env.RAG_PYTHON_AUTOSTART === 'false') return;
  startAttempted = true;
  serviceProcess = spawn(
    pythonCommand,
    [path.resolve(__dirname, '..', 'python', 'rag_service.py')],
    { env: process.env, stdio: 'ignore' }
  );
  serviceProcess.on('error', (error) =>
    console.warn(`[RAG] Python ChromaDB service unavailable: ${error.message}`)
  );
};

/**
 * Generic HTTP request to the Python RAG service (3 retries with 250 ms backoff).
 * @param {'get'|'post'|'delete'} method
 * @param {string} endpoint  e.g. '/ingest'
 * @param {object} [data]    request body for POST
 */
const request = async (method, endpoint, data) => {
  startPythonService();
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await axios({ method, url: `${baseURL}${endpoint}`, data, timeout: 20000 });
      return response.data;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError;
};

/** Ingest user profile data into the user_profiles ChromaDB collection. */
const ingestUser = async (userId, user) => {
  return request('post', '/ingest_user', { userId, user });
};

/** Ingest portfolio holdings into the portfolio_data ChromaDB collection. */
const ingestPortfolio = async (userId, portfolio) => {
  return request('post', '/ingest_portfolio', { userId, portfolio });
};

/** Semantic search with optional user-context enrichment. */
const searchRag = async (query, limit, userId) => {
  const payload = { query, limit };
  if (userId) payload.userId = userId;
  return request('post', '/search', payload);
};

/** Fetch user-specific RAG context (profile + portfolio). */
const searchUserContext = async (userId, query, limit) => {
  return request('post', '/search_user', { userId, query, limit });
};

/** Check whether the Python service is reachable. */
const isAvailable = async () => {
  try {
    await request('get', '/health');
    return true;
  } catch {
    return false;
  }
};

module.exports = {
  request,
  isAvailable,
  ingestUser,
  ingestPortfolio,
  searchRag,
  searchUserContext,
};
