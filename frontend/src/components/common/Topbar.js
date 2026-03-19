import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, X } from 'lucide-react';
import { stockAPI } from '../../utils/api';
import { abbreviateSymbol } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';

export default function Topbar({ title }) {
  const [query, setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen]     = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const ref = useRef(null);
  const { user } = useAuth();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await stockAPI.search(query);
        setResults(res.data.slice(0, 8));
        setOpen(true);
      } catch {}
      setLoading(false);
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  const pick = (symbol) => {
    setQuery(''); setOpen(false);
    navigate(`/stocks/${symbol}`);
  };

  return (
    <header style={{
      height: 'var(--topbar-height)',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 28px',
      gap: 20,
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-primary)', flex: '0 0 auto' }}>{title}</h1>

      {/* Search */}
      <div ref={ref} style={{ flex: 1, maxWidth: 400, position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search stocks, funds…"
            style={{ paddingLeft: 36, paddingRight: query ? 36 : 14, height: 38 }}
          />
          {query && (
            <button onClick={() => { setQuery(''); setOpen(false); }} style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)'
            }}><X size={14} /></button>
          )}
        </div>
        {open && results.length > 0 && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-accent)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-card)',
            zIndex: 200
          }}>
            {results.map((r, i) => (
              <button key={i} onClick={() => pick(r.symbol || r.value)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 14px',
                background: 'none', border: 'none',
                borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.1s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'var(--bg-overlay)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: 'var(--gold)'
                }}>
                  {abbreviateSymbol(r.symbol || r.value).slice(0, 3)}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{abbreviateSymbol(r.symbol || r.value)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.name || r.longName || ''}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 6 }}>
          <Bell size={18} />
        </button>
        <div style={{
          width: 34, height: 34,
          background: 'var(--gold-glow)',
          border: '1px solid rgba(232,196,106,0.3)',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 600, color: 'var(--gold)'
        }}>
          {user?.name?.[0]?.toUpperCase() || 'U'}
        </div>
      </div>
    </header>
  );
}
