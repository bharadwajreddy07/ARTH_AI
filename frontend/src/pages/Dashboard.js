import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, ArrowRight, Sparkles } from 'lucide-react';
import { stockAPI, newsAPI, aiAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatPercent, getChangeClass } from '../utils/format';
import StockCard from '../components/stocks/StockCard';
import NewsCard from '../components/news/NewsCard';
import PriceChart from '../components/dashboard/PriceChart';

const IndexBadge = ({ index }) => {
  const isPos = parseFloat(index.changePercent) >= 0;
  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {index.name?.replace('CNX ', '').replace('S&P BSE ', '')}
        </span>
        {isPos
          ? <TrendingUp size={14} color="var(--green)" />
          : <TrendingDown size={14} color="var(--red)" />
        }
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {formatCurrency(index.price, 0)}
      </div>
      <div style={{ fontSize: 12, color: isPos ? 'var(--green)' : 'var(--red)', marginTop: 2 }}>
        {isPos ? '+' : ''}{formatCurrency(index.change)} ({formatPercent(index.changePercent)})
      </div>
    </div>
  );
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [indices, setIndices]   = useState([]);
  const [gainers, setGainers]   = useState([]);
  const [losers, setLosers]     = useState([]);
  const [news, setNews]         = useState([]);
  const [aiTip, setAiTip]       = useState('');
  const [loading, setLoading]   = useState(true);
  const [chartSymbol] = useState('RELIANCE.NS');

  useEffect(() => {
    Promise.all([
      stockAPI.indices().catch(() => ({ data: [] })),
      stockAPI.gainers().catch(() => ({ data: [] })),
      stockAPI.losers().catch(() => ({ data: [] })),
      newsAPI.market('india').catch(() => ({ data: [] })),
    ]).then(([idx, g, l, n]) => {
      setIndices(idx.data);
      setGainers(g.data.slice(0, 4));
      setLosers(l.data.slice(0, 4));
      setNews(n.data.slice(0, 4));
    }).finally(() => setLoading(false));

    // Fetch AI daily tip
    aiAPI.chat('Give me a concise 2-sentence market insight or investment tip for today for Indian retail investors.', {})
      .then(res => setAiTip(res.data.message))
      .catch(() => setAiTip('Markets move in cycles. Staying invested through volatility and following a disciplined SIP strategy has historically rewarded patient investors.'));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Welcome + AI tip */}
      <div style={{
        background: 'linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-overlay) 100%)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        padding: '24px 28px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', top: -40, right: -40,
          width: 200, height: 200,
          background: 'radial-gradient(circle, var(--gold-glow) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
          {greeting}, {user?.name?.split(' ')[0]} 👋
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, marginBottom: 16 }}>
          Your Market Overview
        </h2>
        {aiTip && (
          <div style={{
            display: 'flex', gap: 12, alignItems: 'flex-start',
            background: 'var(--gold-glow)',
            border: '1px solid rgba(232,196,106,0.2)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            maxWidth: 600
          }}>
            <Sparkles size={16} color="var(--gold)" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, fontStyle: 'italic' }}>
              {aiTip}
            </p>
          </div>
        )}
      </div>

      {/* Indices */}
      {loading ? (
        <div className="grid-3">
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 90 }} />)}
        </div>
      ) : (
        <div className="grid-3">
          {indices.length > 0
            ? indices.map((idx, i) => <IndexBadge key={i} index={idx} />)
            : [
                { name: 'Nifty 50', price: 22350.45, change: 125.30, changePercent: 0.56 },
                { name: 'Sensex', price: 73845.20, change: 389.15, changePercent: 0.53 },
                { name: 'Bank Nifty', price: 47832.60, change: -145.80, changePercent: -0.30 }
              ].map((idx, i) => <IndexBadge key={i} index={idx} />)
          }
        </div>
      )}

      {/* Chart + Top Gainers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Reliance Industries</h3>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>RELIANCE • NSE</span>
            </div>
          </div>
          <PriceChart symbol={chartSymbol} height={200} />
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600 }}>Top Movers</h3>
            <button onClick={() => navigate('/stocks')} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}>
              View all <ArrowRight size={12} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {gainers.slice(0, 4).map((s, i) => (
              <div key={i} onClick={() => navigate(`/stocks/${s.symbol}`)} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 10px', borderRadius: 'var(--radius-md)',
                cursor: 'pointer', transition: 'background 0.1s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.symbol?.replace('.NS','')}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatCurrency(s.price)}</div>
                </div>
                <span className={`badge ${parseFloat(s.changePercent) >= 0 ? 'badge-green' : 'badge-red'}`}>
                  {formatPercent(s.changePercent)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gainers & Losers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>📈 Top Gainers</h3>
          </div>
          <div className="grid-2">
            {gainers.map((s, i) => <StockCard key={i} stock={s} compact />)}
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--red)' }}>📉 Top Losers</h3>
          </div>
          <div className="grid-2">
            {losers.map((s, i) => <StockCard key={i} stock={s} compact />)}
          </div>
        </div>
      </div>

      {/* News */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Market News</h3>
          <button onClick={() => navigate('/news')} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}>
            All news <ArrowRight size={12} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {news.map((article, i) => <NewsCard key={i} article={article} compact />)}
          {news.length === 0 && !loading && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              News loading…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
