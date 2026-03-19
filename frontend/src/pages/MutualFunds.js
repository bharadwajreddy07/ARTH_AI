import React, { useMemo, useState, useEffect } from 'react';
import { Search, TrendingUp, TrendingDown, Sparkles, X } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import { mfAPI, aiAPI, newsAPI } from '../utils/api';
import { formatCurrency, formatPercent } from '../utils/format';
import NewsCard from '../components/news/NewsCard';

const DETAIL_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'performance', label: 'Performance' },
  { value: 'analysis', label: 'AI Analysis' },
  { value: 'news', label: 'News' }
];

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const calculateReturn = (history, days) => {
  const series = Array.isArray(history) ? history.slice(0, days + 1) : [];
  if (series.length < 2) return null;
  const latest = toNumber(series[0]?.nav);
  const previous = toNumber(series[series.length - 1]?.nav);
  if (!latest || !previous) return null;
  return Number((((latest - previous) / previous) * 100).toFixed(2));
};

const MFCard = ({ fund, onSelect }) => {
  const navValue = toNumber(fund.nav);
  const hasNav = navValue > 0;
  const changeValue = toNumber(fund.changePercent ?? fund.change, 0);
  const isPos = changeValue >= 0;

  return (
    <div
      className="card"
      style={{ cursor: 'pointer' }}
      onClick={() => onSelect(fund)}
      onMouseEnter={(event) => {
        event.currentTarget.style.transform = 'translateY(-2px)';
        event.currentTarget.style.borderColor = 'var(--border-accent)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = '';
        event.currentTarget.style.borderColor = '';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--gold)',
          background: 'var(--gold-glow)',
          padding: '2px 8px',
          borderRadius: 99
        }}>
          {fund.category || fund.schemeCategory?.split(' - ')[1] || 'Equity'}
        </div>
        <span className={`badge ${isPos ? 'badge-green' : 'badge-red'}`}>
          {isPos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {formatPercent(changeValue)}
        </span>
      </div>

      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 8 }}>
        {fund.schemeName?.replace(' - Regular Plan', '').replace(' - Regular', '').replace(' Option', '')}
      </h3>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>{fund.fundHouse}</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>NAV</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{hasNav ? formatCurrency(navValue) : '—'}</div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
          {fund.date || 'Latest'}
        </div>
      </div>
    </div>
  );
};

const FundDetailModal = ({ state, onClose }) => {
  if (!state?.fund) return null;

  const { fund, tab, setTab, analysis, analysisLoading, news, newsLoading } = state;
  const history = Array.isArray(fund.historicalData) ? fund.historicalData : [];
  const chartData = history.slice(0, 180).reverse().map((item) => ({
    date: item.date,
    nav: toNumber(item.nav)
  }));

  const performance = [
    { label: '1W', value: calculateReturn(history, 7) },
    { label: '1M', value: calculateReturn(history, 30) },
    { label: '3M', value: calculateReturn(history, 90) },
    { label: '1Y', value: calculateReturn(history, 252) }
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 320, padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="card" style={{ width: 'min(980px, 100%)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--gold)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              {fund.category || fund.schemeCategory || 'Mutual Fund'}
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.35 }}>{fund.schemeName}</h3>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{fund.fundHouse}</div>
          </div>
          <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={onClose}><X size={14} /></button>
        </div>

        <div className="grid-4" style={{ marginBottom: 16 }}>
          {[{
            label: 'NAV', value: fund.nav ? formatCurrency(fund.nav) : '—'
          }, {
            label: 'Daily Change', value: formatPercent(fund.changePercent || fund.change || 0)
          }, {
            label: 'Scheme Type', value: fund.schemeType || '—'
          }, {
            label: 'Scheme Code', value: fund.schemeCode || '—'
          }].map((metric) => (
            <div key={metric.label} className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{metric.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{metric.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {DETAIL_TABS.map((item) => (
            <button
              key={item.value}
              onClick={() => setTab(item.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: tab === item.value ? '1px solid var(--gold-dim)' : '1px solid var(--border)',
                background: tab === item.value ? 'var(--gold-glow)' : 'transparent',
                color: tab === item.value ? 'var(--gold)' : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card" style={{ padding: 14 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>NAV Trend (Last 6 Months)</h4>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="mfNav" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e8c46a" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#e8c46a" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8b8fa8' }} hide={chartData.length > 80} />
                  <YAxis tick={{ fontSize: 11, fill: '#8b8fa8' }} tickFormatter={(value) => `₹${value}`} />
                  <Tooltip
                    formatter={(value) => formatCurrency(value)}
                    labelFormatter={(value) => `Date: ${value}`}
                    contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="nav" stroke="#e8c46a" fill="url(#mfNav)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="card" style={{ padding: 14, color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: 13 }}>
              This view helps compare trend stability, not just latest NAV. Prefer funds with consistent rolling behavior,
              manageable drawdowns, and category-fit for your time horizon.
            </div>
          </div>
        )}

        {tab === 'performance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="grid-4">
              {performance.map((item) => (
                <div key={item.label} className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.label} Return</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: item.value === null ? 'var(--text-muted)' : item.value >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {item.value === null ? 'N/A' : formatPercent(item.value)}
                  </div>
                </div>
              ))}
            </div>

            <div className="card" style={{ padding: 14 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Return Profile</h4>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={performance.map((item) => ({ ...item, value: item.value || 0 }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8b8fa8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#8b8fa8' }} />
                  <Tooltip
                    formatter={(value) => formatPercent(value)}
                    contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="value" fill="#60a5fa" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {tab === 'analysis' && (
          <div className="card" style={{ padding: 14 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={14} color="var(--gold)" /> Detailed Mutual Fund Analysis
            </h4>
            {analysisLoading ? (
              <div className="skeleton" style={{ height: 140 }} />
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                {analysis || 'AI analysis is currently unavailable for this scheme.'}
              </div>
            )}
          </div>
        )}

        {tab === 'news' && (
          <div>
            {newsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton" style={{ height: 90 }} />)}
              </div>
            ) : news.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {news.map((article, index) => <NewsCard key={article.id || index} article={article} compact />)}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No related fund news found.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default function MutualFunds() {
  const [funds, setFunds] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFund, setSelectedFund] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [hydratingPrices, setHydratingPrices] = useState(false);
  const [initialHydrationDone, setInitialHydrationDone] = useState(false);
  const [detailTab, setDetailTab] = useState('overview');
  const [analysis, setAnalysis] = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [relatedNews, setRelatedNews] = useState([]);
  const [relatedNewsLoading, setRelatedNewsLoading] = useState(false);

  useEffect(() => {
    mfAPI.popular()
      .then((res) => setFunds(Array.isArray(res.data) ? res.data : []))
      .catch(() => setFunds([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await mfAPI.search(query);
        setResults(Array.isArray(response.data) ? response.data.slice(0, 12) : []);
      } catch (err) {
        setResults([]);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (initialHydrationDone || !funds.length) return;

    const missing = funds.filter((fund) => {
      const nav = toNumber(fund.nav);
      return nav <= 0;
    }).slice(0, 12);

    if (!missing.length) {
      setInitialHydrationDone(true);
      return;
    }

    setHydratingPrices(true);
    Promise.all(missing.map(async (fund) => {
      try {
        const response = await mfAPI.details(fund.schemeCode);
        return [String(fund.schemeCode), response.data];
      } catch (err) {
        return [String(fund.schemeCode), null];
      }
    })).then((pairs) => {
      const map = new Map(pairs.filter(([, value]) => value));
      setFunds((prev) => prev.map((fund) => {
        const details = map.get(String(fund.schemeCode));
        return details ? { ...fund, ...details } : fund;
      }));
    }).finally(() => {
      setHydratingPrices(false);
      setInitialHydrationDone(true);
    });
  }, [funds, initialHydrationDone]);

  const openFundDetails = async (fund) => {
    setSelectedFund(fund);
    setDetailTab('overview');
    setAnalysis('');
    setRelatedNews([]);

    if (!fund?.schemeCode) return;

    setDetailsLoading(true);
    try {
      const response = await mfAPI.details(fund.schemeCode);
      setSelectedFund({ ...fund, ...response.data });
    } catch (err) {
      // Keep existing fund payload.
    } finally {
      setDetailsLoading(false);
    }

    setAnalysisLoading(true);
    aiAPI.analyzeMutualFund(fund.schemeCode)
      .then((res) => setAnalysis(res.data?.analysis || ''))
      .catch(() => setAnalysis('Unable to fetch AI mutual fund analysis right now.'))
      .finally(() => setAnalysisLoading(false));

    setRelatedNewsLoading(true);
    newsAPI.search(`${fund.schemeName} mutual fund india`, 'india', 10)
      .then((res) => setRelatedNews(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRelatedNews([]))
      .finally(() => setRelatedNewsLoading(false));
  };

  const displayFunds = query.trim() ? results : funds;

  const modalState = useMemo(() => {
    if (!selectedFund) return null;
    return {
      fund: selectedFund,
      tab: detailTab,
      setTab: setDetailTab,
      analysis,
      analysisLoading: analysisLoading || detailsLoading,
      news: relatedNews,
      newsLoading: relatedNewsLoading || detailsLoading
    };
  }, [selectedFund, detailTab, analysis, analysisLoading, relatedNews, relatedNewsLoading, detailsLoading]);

  return (
    <div className="animate-in">
      <div style={{ marginBottom: 24, maxWidth: 420, position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search mutual funds..." style={{ paddingLeft: 36 }} />
      </div>

      {!query.trim() && hydratingPrices && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Fetching latest NAV values...
        </div>
      )}

      {loading ? (
        <div className="grid-3">
          {Array.from({ length: 9 }).map((_, index) => <div key={index} className="skeleton" style={{ height: 164 }} />)}
        </div>
      ) : (
        <div className="grid-3">
          {displayFunds.map((fund, index) => (
            <MFCard key={fund.schemeCode || index} fund={fund} onSelect={openFundDetails} />
          ))}
        </div>
      )}

      <FundDetailModal state={modalState} onClose={() => setSelectedFund(null)} />
    </div>
  );
}