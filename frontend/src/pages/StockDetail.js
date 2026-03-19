import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, StarOff, Sparkles, TrendingUp, TrendingDown, Plus, Newspaper, Activity, BarChart3, Users, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, BarChart as ReBarChart, Bar } from 'recharts';
import { stockAPI, newsAPI, aiAPI, watchlistAPI, portfolioAPI } from '../utils/api';
import { formatCurrency, formatNumber, formatPercent, abbreviateSymbol, getChangeClass } from '../utils/format';
import PriceChart from '../components/dashboard/PriceChart';
import NewsCard from '../components/news/NewsCard';
import StockCard from '../components/stocks/StockCard';

const STOCK_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'technicals', label: 'Technicals' },
  { value: 'fno', label: 'F&O' },
  { value: 'news', label: 'News' },
  { value: 'ai', label: 'AI Analysis' }
];

const FINANCIAL_METRICS = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'profit', label: 'Profit' },
  { value: 'netWorth', label: 'Net Worth' }
];

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const compactAxisNumber = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  const abs = Math.abs(num);
  if (abs >= 1e12) return `${(num / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toFixed(0);
};

const MetricBox = ({ label, value, sub, className = '' }) => (
  <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '12px 16px' }}>
    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    <div className={className} style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{sub}</div>}
  </div>
);

const RangeBar = ({ min, max, value, color = '#60a5fa' }) => {
  const low = toNumber(min);
  const high = toNumber(max);
  const current = toNumber(value);
  const percent = high > low ? ((current - low) / (high - low)) * 100 : 0;
  const bounded = Math.max(0, Math.min(100, percent));

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
        <span>{formatCurrency(low)}</span>
        <span>{formatCurrency(high)}</span>
      </div>
      <div style={{ marginTop: 6, height: 6, borderRadius: 99, background: 'var(--bg-overlay)', overflow: 'hidden' }}>
        <div style={{ width: `${bounded}%`, height: '100%', background: color, transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>{bounded.toFixed(1)}%</div>
    </div>
  );
};

export default function StockDetail() {
  const { symbol } = useParams();
  const navigate = useNavigate();

  const [quote, setQuote] = useState(null);
  const [deep, setDeep] = useState(null);
  const [dualQuotes, setDualQuotes] = useState({ nse: null, bse: null });
  const [news, setNews] = useState([]);
  const [fno, setFno] = useState([]);
  const [analysis, setAnalysis] = useState('');
  const [analysisSummary, setAnalysisSummary] = useState([]);
  const [ragSources, setRagSources] = useState([]);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [addOpen, setAddOpen] = useState(false);
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [financialMetric, setFinancialMetric] = useState('revenue');
  const [financialPeriod, setFinancialPeriod] = useState('yearly');

  const normalizedSymbol = useMemo(() => String(symbol || '').trim(), [symbol]);
  const baseSymbol = useMemo(() => normalizedSymbol.replace('.NS', '').replace('.BO', '').toUpperCase(), [normalizedSymbol]);

  useEffect(() => {
    let mounted = true;

    setLoading(true);
    setActiveTab('overview');
    setAnalysis('');
    setAnalysisSummary([]);
    setRagSources([]);
    setFinancialPeriod('yearly');

    Promise.all([
      stockAPI.deep(normalizedSymbol).catch(() => ({ data: null })),
      stockAPI.quote(normalizedSymbol).catch(() => ({ data: null })),
      stockAPI.quoteBoth(normalizedSymbol).catch(() => ({ data: { nse: null, bse: null } })),
      newsAPI.stock(normalizedSymbol).catch(() => ({ data: [] })),
      stockAPI.fno().catch(() => ({ data: [] })),
      watchlistAPI.get().catch(() => ({ data: { items: [] } }))
    ]).then(([deepRes, quoteRes, dualRes, newsRes, fnoRes, watchRes]) => {
      if (!mounted) return;

      const deepData = deepRes.data;
      const resolvedQuote = deepData?.quote || quoteRes.data;

      setDeep(deepData || null);
      setQuote(resolvedQuote || null);
      setDualQuotes({ nse: dualRes.data?.nse || null, bse: dualRes.data?.bse || null });
      setNews(Array.isArray(newsRes.data) ? newsRes.data.slice(0, 14) : []);
      setFno(Array.isArray(fnoRes.data) ? fnoRes.data : []);
      setInWatchlist(Boolean(watchRes.data?.items?.some((item) => item.symbol === normalizedSymbol)));
    }).finally(() => {
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [normalizedSymbol]);

  useEffect(() => {
    if (!quote || news.length) return;

    setNewsLoading(true);
    const q = `${quote.name || baseSymbol} ${baseSymbol} india stock`;

    newsAPI.search(q, 'india', 12)
      .then((res) => {
        setNews(Array.isArray(res.data) ? res.data : []);
      })
      .finally(() => setNewsLoading(false));
  }, [baseSymbol, quote, news]);

  const loadAnalysis = async () => {
    if (analysis) return;
    setAiLoading(true);
    try {
      const res = await aiAPI.analyzeRealtime(normalizedSymbol).catch(() => aiAPI.analyze(normalizedSymbol));
      setAnalysis(res.data?.analysis || 'No analysis generated.');
      setAnalysisSummary(Array.isArray(res.data?.summary) ? res.data.summary : []);
      setRagSources(Array.isArray(res.data?.rag?.sources) ? res.data.rag.sources : []);
    } catch {
      setAnalysis('AI analysis unavailable. Please configure GROQ_API_KEY or OPENAI_API_KEY in backend environment.');
      setAnalysisSummary([]);
      setRagSources([]);
    }
    setAiLoading(false);
  };

  const toggleWatchlist = async () => {
    try {
      if (inWatchlist) {
        await watchlistAPI.remove(normalizedSymbol);
        toast.success('Removed from watchlist');
      } else {
        await watchlistAPI.add({ symbol: normalizedSymbol, name: quote?.name, type: 'stock' });
        toast.success('Added to watchlist');
      }
      setInWatchlist(!inWatchlist);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error updating watchlist');
    }
  };

  const addToPortfolio = async () => {
    if (!qty || !price) return toast.error('Enter quantity and price');

    try {
      await portfolioAPI.addHolding({
        symbol: normalizedSymbol,
        name: quote?.name,
        type: 'stock',
        quantity: parseFloat(qty),
        avgBuyPrice: parseFloat(price)
      });
      toast.success('Added to portfolio');
      setAddOpen(false);
      setQty('');
      setPrice('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error adding to portfolio');
    }
  };

  const companyInfo = deep?.companyInfo || {};
  const overview = deep?.overview || {};
  const technicals = deep?.technicals || {};
  const fundamentals = deep?.fundamentals || {};
  const shareholdingData = deep?.shareholding || {};
  const shareholding = Array.isArray(shareholdingData?.distribution) ? shareholdingData.distribution : [];
  const topInstitutional = Array.isArray(shareholdingData?.topInstitutional) ? shareholdingData.topInstitutional : [];
  const yearlyFinancialPoints = Array.isArray(deep?.financials?.yearly) ? deep.financials.yearly : [];
  const quarterlyFinancialPoints = Array.isArray(deep?.financials?.quarterly) ? deep.financials.quarterly : [];
  const selectedFinancialPoints = financialPeriod === 'quarterly'
    ? (quarterlyFinancialPoints.length ? quarterlyFinancialPoints : yearlyFinancialPoints)
    : (yearlyFinancialPoints.length ? yearlyFinancialPoints : quarterlyFinancialPoints);
  const relatedStocks = Array.isArray(deep?.relatedStocks) ? deep.relatedStocks : [];

  const relatedFnO = useMemo(() => {
    return fno
      .filter((contract) => {
        const underlying = String(contract.underlying || '').toUpperCase();
        const instrument = String(contract.instrument || '').toUpperCase();
        return underlying.includes(baseSymbol) || instrument.includes(baseSymbol);
      })
      .slice(0, 8);
  }, [fno, baseSymbol]);

  const financialSeries = useMemo(() => {
    const points = selectedFinancialPoints.map((item) => ({ period: item.period, value: toNumber(item[financialMetric], 0) }));
    const max = Math.max(1, ...points.map((item) => item.value));
    return points.map((item) => ({ ...item, pct: (item.value / max) * 100 }));
  }, [selectedFinancialPoints, financialMetric]);

  const recommendation = deep?.recommendation;
  const isPos = toNumber(quote?.changePercent) >= 0;

  if (loading) {
    return (
      <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="skeleton" style={{ height: 120, borderRadius: 16 }} />
        <div className="skeleton" style={{ height: 280, borderRadius: 16 }} />
      </div>
    );
  }

  if (!quote) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
        <p>Could not load stock data for {normalizedSymbol}</p>
      </div>
    );
  }

  const fundamentalsTable = [
    { label: 'Mkt Cap', value: formatNumber(fundamentals.marketCap || quote.marketCap) },
    { label: 'ROE', value: fundamentals.roe ? `${fundamentals.roe}%` : '—' },
    { label: 'P/E Ratio (TTM)', value: fundamentals.pe ? fundamentals.pe.toFixed(2) : '—' },
    { label: 'EPS (TTM)', value: fundamentals.eps ? fundamentals.eps.toFixed(2) : '—' },
    { label: 'P/B Ratio', value: fundamentals.pb ? fundamentals.pb.toFixed(2) : '—' },
    { label: 'Div Yield', value: fundamentals.dividendYield ? `${fundamentals.dividendYield}%` : '—' },
    { label: 'Industry P/E', value: fundamentals.industryPe ? fundamentals.industryPe.toFixed(2) : '—' },
    { label: 'Book Value', value: fundamentals.bookValue ? fundamentals.bookValue.toFixed(2) : '—' },
    { label: 'Debt to Equity', value: fundamentals.debtToEquity ? fundamentals.debtToEquity.toFixed(2) : '—' },
    { label: 'Face Value', value: fundamentals.faceValue || '—' }
  ];

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <button onClick={() => navigate(-1)} className="btn btn-ghost" style={{ padding: '6px 12px', marginBottom: 16, fontSize: 13 }}>
          <ArrowLeft size={14} /> Back
        </button>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <div style={{
                  width: 44,
                  height: 44,
                  background: 'var(--gold-glow)',
                  border: '1px solid rgba(232,196,106,0.3)',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 12,
                  color: 'var(--gold)'
                }}>
                  {abbreviateSymbol(normalizedSymbol).slice(0, 4)}
                </div>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700 }}>{abbreviateSymbol(normalizedSymbol)}</h2>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {quote.name} • {quote.exchange}
                    {companyInfo.sector ? ` • ${companyInfo.sector}` : ''}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 36 }}>{formatCurrency(quote.price)}</span>
                <span className={isPos ? 'positive' : 'negative'} style={{ fontSize: 16, fontWeight: 600 }}>
                  {isPos ? <TrendingUp size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> : <TrendingDown size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
                  {toNumber(quote.change) > 0 ? '+' : ''}{formatCurrency(quote.change)} ({formatPercent(quote.changePercent)})
                </span>
              </div>

              {!!news[0]?.headline && (
                <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                  Latest catalyst: {news[0].headline}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={toggleWatchlist} className="btn btn-ghost" style={{ padding: '8px 14px' }}>
                {inWatchlist ? <StarOff size={14} /> : <Star size={14} />}
                {inWatchlist ? 'Unwatch' : 'Watch'}
              </button>
              <button onClick={() => setAddOpen(!addOpen)} className="btn btn-primary" style={{ padding: '8px 14px' }}>
                <Plus size={14} /> Add to Portfolio
              </button>
            </div>
          </div>

          {addOpen && (
            <div style={{
              marginTop: 16,
              padding: 16,
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              gap: 12,
              alignItems: 'flex-end',
              flexWrap: 'wrap'
            }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Quantity</label>
                <input type="number" value={qty} onChange={(event) => setQty(event.target.value)} placeholder="e.g. 10" />
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Buy Price (₹)</label>
                <input type="number" value={price} onChange={(event) => setPrice(event.target.value)} placeholder={formatCurrency(quote.price)} />
              </div>
              <button onClick={addToPortfolio} className="btn btn-primary">Confirm</button>
              <button onClick={() => setAddOpen(false)} className="btn btn-ghost">Cancel</button>
            </div>
          )}

          {(dualQuotes.nse || dualQuotes.bse) && (
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {[{ key: 'nse', label: 'NSE', data: dualQuotes.nse }, { key: 'bse', label: 'BSE', data: dualQuotes.bse }].map((exchange) => {
                const change = toNumber(exchange.data?.changePercent);
                const positive = change >= 0;

                return (
                  <div key={exchange.key} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{exchange.label}</div>
                    {exchange.data ? (
                      <>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{formatCurrency(exchange.data.price)}</div>
                        <div style={{ fontSize: 12, color: positive ? 'var(--green)' : 'var(--red)' }}>
                          {positive ? '+' : ''}{formatPercent(change)}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Not available</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {STOCK_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              border: activeTab === tab.value ? '1px solid var(--gold-dim)' : '1px solid var(--border)',
              background: activeTab === tab.value ? 'var(--gold-glow)' : 'transparent',
              color: activeTab === tab.value ? 'var(--gold)' : 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Price History</h3>
            <PriceChart symbol={normalizedSymbol} height={250} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}><Activity size={14} /> Day Range Position</h3>
              <RangeBar min={overview.dayLow || quote.dayLow} max={overview.dayHigh || quote.dayHigh} value={quote.price} color="#60a5fa" />
            </div>
            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}><BarChart3 size={14} /> 52-Week Range Position</h3>
              <RangeBar min={overview.low52w || quote.low52w} max={overview.high52w || quote.high52w} value={quote.price} color="#e8c46a" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <MetricBox label="Open" value={formatCurrency(overview.open || quote.open)} />
            <MetricBox label="Prev Close" value={formatCurrency(overview.previousClose || quote.previousClose)} />
            <MetricBox label="Volume" value={formatNumber(overview.volume || quote.volume)} />
            <MetricBox label="Lower Circuit*" value={formatCurrency(overview.lowerCircuitEstimate)} sub="Estimated 10% band" />
            <MetricBox label="Upper Circuit*" value={formatCurrency(overview.upperCircuitEstimate)} sub="Estimated 10% band" />
          </div>

          <div className="card">
            <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 14 }}>Fundamentals</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {fundamentalsTable.map((item) => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{item.label}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 14 }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Financials</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>
              All values are as reported; units may vary by source.
              {deep?.financials?.source ? ` Source: ${deep.financials.source}.` : ''}
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <button
                onClick={() => setFinancialPeriod('yearly')}
                className={financialPeriod === 'yearly' ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ padding: '6px 12px', fontSize: 12 }}
              >
                Yearly
              </button>
              <button
                onClick={() => setFinancialPeriod('quarterly')}
                className={financialPeriod === 'quarterly' ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ padding: '6px 12px', fontSize: 12 }}
              >
                Quarterly
              </button>
              {FINANCIAL_METRICS.map((metric) => (
                <button
                  key={metric.value}
                  onClick={() => setFinancialMetric(metric.value)}
                  className={financialMetric === metric.value ? 'btn btn-primary' : 'btn btn-ghost'}
                  style={{ padding: '6px 12px', fontSize: 12 }}
                >
                  {metric.label}
                </button>
              ))}
            </div>

            {financialSeries.length ? (
              <>
                <div style={{ height: 260, marginBottom: 14 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ReBarChart data={financialSeries} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                      <XAxis dataKey="period" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={compactAxisNumber} width={68} />
                      <Tooltip
                        cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                        formatter={(value) => [formatNumber(value), FINANCIAL_METRICS.find((metric) => metric.value === financialMetric)?.label || 'Value']}
                        labelStyle={{ color: '#111827' }}
                      />
                      <Bar dataKey="value" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                    </ReBarChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {financialSeries.map((point) => (
                    <div key={`${financialMetric}-${point.period}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-muted)' }}>{point.period}</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{formatNumber(point.value)}</span>
                      </div>
                      <div style={{ height: 7, borderRadius: 99, background: 'var(--bg-overlay)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(4, point.pct)}%`, height: '100%', background: 'linear-gradient(90deg,#60a5fa,#e8c46a)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Financial trend data unavailable for this symbol.</div>
            )}
          </div>

          <div className="card">
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><Users size={18} /> Shareholder Pattern</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>
              {shareholdingData?.source ? `Source: ${shareholdingData.source}. ` : ''}
              {shareholdingData?.asOf ? `As of: ${shareholdingData.asOf}.` : 'Latest available filing period.'}
            </p>
            {shareholding.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {shareholding.map((item) => (
                  <div key={item.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{item.value}%</span>
                    </div>
                    <div style={{ height: 7, borderRadius: 99, background: 'var(--bg-overlay)', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(2, Math.min(100, toNumber(item.value)))}%`, height: '100%', background: '#34d399' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Shareholding breakup is unavailable from the current feed.</p>
            )}

            {topInstitutional.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <h4 style={{ fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Building2 size={14} /> Top Institutional Holders</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                  {topInstitutional.slice(0, 6).map((holder) => (
                    <div key={holder.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, background: 'var(--bg-elevated)', padding: '7px 10px', borderRadius: 'var(--radius-sm)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{holder.name}</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{holder.percent}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {relatedStocks.length > 0 && (
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Related Stocks</h3>
              <div className="grid-2">
                {relatedStocks.map((item) => <StockCard key={item.symbol} stock={item} compact />)}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'technicals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <MetricBox label="SMA 20" value={formatCurrency(technicals.sma20)} className={toNumber(quote.price) >= toNumber(technicals.sma20) ? 'positive' : 'negative'} />
            <MetricBox label="SMA 50" value={formatCurrency(technicals.sma50)} className={toNumber(quote.price) >= toNumber(technicals.sma50) ? 'positive' : 'negative'} />
            <MetricBox label="EMA 20" value={formatCurrency(technicals.ema20)} />
            <MetricBox label="EMA 50" value={formatCurrency(technicals.ema50)} />
            <MetricBox label="RSI 14" value={technicals.rsi14 ? technicals.rsi14.toFixed(2) : '—'} className={technicals.rsi14 > 70 ? 'negative' : technicals.rsi14 < 30 ? 'positive' : ''} />
            <MetricBox label="MACD" value={technicals.macd?.macd ?? '—'} sub={`Signal: ${technicals.macd?.signal ?? '—'}`} />
            <MetricBox label="ATR 14" value={technicals.atr14 ? technicals.atr14.toFixed(2) : '—'} />
            <MetricBox label="Volatility 30D" value={technicals.volatility30d ? `${technicals.volatility30d}%` : '—'} />
            <MetricBox label="Support" value={formatCurrency(technicals.support)} />
            <MetricBox label="Resistance" value={formatCurrency(technicals.resistance)} />
            <MetricBox label="Trend" value={technicals.trend || 'unknown'} className={getChangeClass(quote.changePercent)} />
          </div>

          {recommendation && (
            <div className="card">
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>Analyst Recommendation Distribution</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                {[
                  { label: 'Strong Buy', value: recommendation.strongBuy, color: '#4ade80' },
                  { label: 'Buy', value: recommendation.buy, color: '#22c55e' },
                  { label: 'Hold', value: recommendation.hold, color: '#eab308' },
                  { label: 'Sell', value: recommendation.sell, color: '#f97316' },
                  { label: 'Strong Sell', value: recommendation.strongSell, color: '#ef4444' }
                ].map((item) => (
                  <div key={item.label} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '9px 10px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'fno' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.75 }}>
            F&O contracts shown here are linked to the same underlying where available. Use this with options chain/OI tools for full conviction.
          </div>

          {relatedFnO.length ? (
            <div className="grid-3">
              {relatedFnO.map((contract) => {
                const positive = toNumber(contract.changePercent) >= 0;
                return (
                  <div key={contract.id} className="card" style={{ padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{contract.instrument}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Expiry {contract.expiry}</div>
                      </div>
                      <span className={`badge ${positive ? 'badge-green' : 'badge-red'}`}>{formatPercent(contract.changePercent)}</span>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrency(contract.ltp)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                      {contract.contractType === 'OPT' ? `${contract.optionType} | Strike ${contract.strike}` : 'Futures'} | Lot {contract.lotSize}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
              No related F&O contracts currently mapped for this symbol.
            </div>
          )}
        </div>
      )}

      {activeTab === 'news' && (
        <div>
          <div className="card" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            <Newspaper size={14} />
            Highly related stock news based on company/symbol match and India market context.
          </div>

          {newsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 5 }).map((_, index) => <div key={index} className="skeleton" style={{ height: 90 }} />)}
            </div>
          ) : news.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {news.map((article, index) => <NewsCard key={article.id || index} article={article} />)}
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
              No related news found for this symbol.
            </div>
          )}
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={16} color="var(--gold)" />
              Deep Realtime AI Analysis (RAG)
            </h3>
            {!analysis && (
              <button onClick={loadAnalysis} className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 12 }} disabled={aiLoading}>
                {aiLoading ? <span className="spinner" /> : 'Generate Deep Analysis'}
              </button>
            )}
          </div>

          {aiLoading && <div className="skeleton" style={{ height: 160 }} />}

          {analysis && (
            <>
              {analysisSummary.length > 0 && (
                <div style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
                  {analysisSummary.map((line, index) => (
                    <div key={`${index}-${line}`} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {line}
                    </div>
                  ))}
                </div>
              )}

              <div style={{
                fontSize: 13,
                lineHeight: 1.8,
                color: 'var(--text-secondary)',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-md)',
                padding: 16,
                whiteSpace: 'pre-wrap'
              }}>
                {analysis}
              </div>
            </>
          )}

          {!analysis && !aiLoading && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Generates augmented analysis using technicals, fundamentals, shareholding, related stocks, and real-time news context.
            </p>
          )}

          {ragSources.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                RAG Sources
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ragSources.map((source, index) => (
                  <span key={`${source}-${index}`} style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 99, padding: '3px 10px', color: 'var(--text-secondary)' }}>
                    {source}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}