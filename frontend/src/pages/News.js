import React, { useMemo, useState, useEffect } from 'react';
import { Newspaper, TrendingUp, TrendingDown, Minus, Globe2 } from 'lucide-react';
import { newsAPI } from '../utils/api';
import NewsCard from '../components/news/NewsCard';

const TABS = [
  { label: 'India Market', value: 'india' },
  { label: 'Mergers', value: 'merger' },
  { label: 'F&O', value: 'fno' },
  { label: 'Bonds', value: 'bonds' },
  { label: 'Forex', value: 'forex' },
  { label: 'Crypto', value: 'crypto' }
];

const SentimentBar = ({ news }) => {
  const positive = news.filter((n) => n.sentiment?.label === 'positive').length;
  const negative = news.filter((n) => n.sentiment?.label === 'negative').length;
  const neutral = news.filter((n) => n.sentiment?.label === 'neutral').length;
  const total = news.length || 1;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600 }}>News Sentiment Snapshot</h3>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Based on {total} articles</span>
      </div>

      <div style={{ height: 8, borderRadius: 99, overflow: 'hidden', display: 'flex', marginBottom: 12 }}>
        <div style={{ width: `${(positive / total) * 100}%`, background: 'var(--green)', transition: 'width 0.6s ease' }} />
        <div style={{ width: `${(neutral / total) * 100}%`, background: 'var(--text-muted)', transition: 'width 0.6s ease' }} />
        <div style={{ width: `${(negative / total) * 100}%`, background: 'var(--red)', transition: 'width 0.6s ease' }} />
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Bullish', count: positive, color: 'var(--green)', Icon: TrendingUp },
          { label: 'Neutral', count: neutral, color: 'var(--text-muted)', Icon: Minus },
          { label: 'Bearish', count: negative, color: 'var(--red)', Icon: TrendingDown }
        ].map(({ label, count, color, Icon }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon size={13} color={color} />
            <span style={{ fontSize: 12, color }}>
              <strong>{count}</strong> <span style={{ color: 'var(--text-muted)' }}>{label}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function News() {
  const [news, setNews] = useState([]);
  const [tab, setTab] = useState('india');
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState('list');
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');

    newsAPI.market(tab)
      .then((res) => setNews(Array.isArray(res.data) ? res.data : []))
      .catch((err) => {
        setNews([]);
        setError(err?.response?.data?.error || 'Unable to load live news feed.');
      })
      .finally(() => setLoading(false));
  }, [tab]);

  const sourcePreview = useMemo(() => {
    const sourceCount = new Map();
    for (const item of news) {
      const source = item.source || 'Unknown';
      sourceCount.set(source, (sourceCount.get(source) || 0) + 1);
    }
    return Array.from(sourceCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [news]);

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map((item) => (
          <button
            key={item.value}
            onClick={() => setTab(item.value)}
            style={{
              padding: '7px 14px',
              borderRadius: 'var(--radius-sm)',
              border: tab === item.value ? '1px solid var(--gold-dim)' : '1px solid var(--border)',
              background: tab === item.value ? 'var(--gold-glow)' : 'transparent',
              color: tab === item.value ? 'var(--gold)' : 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            {item.label}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {['list', 'grid'].map((item) => (
            <button
              key={item}
              onClick={() => setLayout(item)}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: layout === item ? '1px solid var(--border-accent)' : '1px solid var(--border)',
                background: layout === item ? 'var(--bg-elevated)' : 'transparent',
                color: layout === item ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              {item === 'list' ? 'List' : 'Grid'}
            </button>
          ))}
        </div>
      </div>

      {!!sourcePreview.length && !loading && (
        <div className="card" style={{ marginBottom: 16, padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Top Sources
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {sourcePreview.map(([name, count]) => (
              <span key={name} style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 999,
                padding: '4px 10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}>
                <Globe2 size={12} /> {name} ({count})
              </span>
            ))}
          </div>
        </div>
      )}

      {!loading && news.length > 0 && <SentimentBar news={news} />}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="skeleton" style={{ height: 110 }} />)}
        </div>
      ) : news.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
          <Newspaper size={48} style={{ opacity: 0.2, marginBottom: 14 }} />
          <h3 style={{ fontSize: 18, marginBottom: 8, color: 'var(--text-secondary)' }}>No news available</h3>
          <p style={{ fontSize: 13, marginBottom: 6 }}>{error || 'No articles returned by providers.'}</p>
          <p style={{ fontSize: 12 }}>Please verify FINNHUB and NEWS provider keys in backend env.</p>
        </div>
      ) : layout === 'list' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {news.map((article, index) => <NewsCard key={article.id || index} article={article} />)}
        </div>
      ) : (
        <div className="grid-2">
          {news.map((article, index) => <NewsCard key={article.id || index} article={article} compact />)}
        </div>
      )}
    </div>
  );
}