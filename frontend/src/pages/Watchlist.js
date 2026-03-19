import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Star, Search, TrendingUp, TrendingDown, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { watchlistAPI, stockAPI } from '../utils/api';
import { formatCurrency, formatPercent, abbreviateSymbol } from '../utils/format';

export default function Watchlist() {
  const [watchlist, setWatchlist]   = useState([]);
  const [quotes, setQuotes]         = useState({});
  const [query, setQuery]           = useState('');
  const [searchRes, setSearchRes]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [searching, setSearching]   = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const res = await watchlistAPI.get();
      const items = res.data?.items || [];
      setWatchlist(items);
      // Fetch live quotes
      const qs = await Promise.all(
        items.map(i => stockAPI.quote(i.symbol).then(r => [i.symbol, r.data]).catch(() => [i.symbol, null]))
      );
      setQuotes(Object.fromEntries(qs.filter(([, v]) => v)));
    } catch {
      toast.error('Failed to load watchlist');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!query.trim()) { setSearchRes([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await stockAPI.search(query);
        setSearchRes(res.data.slice(0, 6));
      } catch {}
      setSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  const add = async (stock) => {
    try {
      await watchlistAPI.add({ symbol: stock.symbol || stock.value, name: stock.name || stock.longName, type: 'stock' });
      toast.success(`${abbreviateSymbol(stock.symbol || stock.value)} added`);
      setQuery(''); setSearchRes([]);
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error adding');
    }
  };

  const remove = async (symbol) => {
    try {
      await watchlistAPI.remove(symbol);
      toast.success('Removed from watchlist');
      setWatchlist(w => w.filter(i => i.symbol !== symbol));
    } catch {
      toast.error('Error removing');
    }
  };

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Add stock search bar */}
      <div style={{ position: 'relative', maxWidth: 440 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search to add a stock to watchlist…"
          style={{ paddingLeft: 36 }}
        />
        {searchRes.length > 0 && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-accent)',
            borderRadius: 'var(--radius-md)', overflow: 'hidden', zIndex: 200,
            boxShadow: 'var(--shadow-card)'
          }}>
            {searchRes.map((r, i) => {
              const sym = r.symbol || r.value;
              const alreadyIn = watchlist.some(w => w.symbol === sym);
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderBottom: i < searchRes.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{abbreviateSymbol(sym)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.name || r.longName || ''}</div>
                  </div>
                  <button
                    onClick={() => !alreadyIn && add(r)}
                    className={alreadyIn ? 'btn btn-ghost' : 'btn btn-primary'}
                    style={{ padding: '4px 12px', fontSize: 12 }}
                    disabled={alreadyIn}
                  >
                    {alreadyIn ? 'Added' : <><Plus size={12} /> Add</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Watchlist */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 72 }} />)}
        </div>
      ) : watchlist.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
          <Star size={48} style={{ opacity: 0.15, marginBottom: 16 }} />
          <h3 style={{ fontSize: 18, marginBottom: 8, color: 'var(--text-secondary)' }}>No stocks watched yet</h3>
          <p style={{ fontSize: 13 }}>Search above to track your favourite stocks.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Watching {watchlist.length} stocks</h3>
          </div>
          {watchlist.map((item, i) => {
            const q = quotes[item.symbol];
            const isPos = q ? parseFloat(q.changePercent) >= 0 : null;
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 20px',
                borderBottom: i < watchlist.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: 'pointer',
                transition: 'background 0.1s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
              onClick={() => navigate(`/stocks/${item.symbol}`)}
              >
                {/* Symbol badge */}
                <div style={{
                  width: 42, height: 42, flexShrink: 0,
                  background: 'var(--bg-overlay)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: 'var(--gold)'
                }}>
                  {abbreviateSymbol(item.symbol).slice(0, 4)}
                </div>

                {/* Name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{abbreviateSymbol(item.symbol)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                </div>

                {/* Price */}
                {q ? (
                  <>
                    <div style={{ textAlign: 'right', minWidth: 90 }}>
                      <div style={{ fontWeight: 700, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(q.price)}</div>
                      <div style={{ fontSize: 11, color: isPos ? 'var(--green)' : 'var(--red)' }}>
                        {isPos ? '+' : ''}{formatCurrency(q.change)}
                      </div>
                    </div>
                    <span className={`badge ${isPos ? 'badge-green' : 'badge-red'}`} style={{ minWidth: 64, justifyContent: 'center' }}>
                      {isPos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {formatPercent(q.changePercent)}
                    </span>
                  </>
                ) : (
                  <div className="skeleton" style={{ width: 80, height: 28 }} />
                )}

                {/* Remove */}
                <button
                  onClick={e => { e.stopPropagation(); remove(item.symbol); }}
                  className="btn btn-ghost"
                  style={{ padding: '6px 8px', color: 'var(--text-muted)' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
