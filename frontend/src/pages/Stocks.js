import React, { useMemo, useState, useEffect } from 'react';
import { Search, TrendingUp, TrendingDown, ShieldCheck, Landmark, CalendarClock, X } from 'lucide-react';
import { stockAPI, newsAPI } from '../utils/api';
import { formatCurrency, formatPercent } from '../utils/format';
import StockCard from '../components/stocks/StockCard';
import NewsCard from '../components/news/NewsCard';

const VIEW_TABS = [
  { value: 'equity', label: 'Equities' },
  { value: 'fno', label: 'F&O' },
  { value: 'bonds', label: 'Bonds' },
  { value: 'ipo', label: 'IPO' }
];

const EXCHANGE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'nse', label: 'NSE' },
  { value: 'bse', label: 'BSE' }
];

const EQUITY_SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'change', label: 'Top Movers' },
  { value: 'marketCap', label: 'Market Cap' },
  { value: 'price', label: 'Price' }
];

const SectionHint = ({ text }) => (
  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>{text}</p>
);

const FnOCard = ({ item, onOpen }) => {
  const positive = Number(item.changePercent || 0) >= 0;
  return (
    <div className="card" style={{ padding: 16, cursor: 'pointer' }} onClick={() => onOpen(item, 'fno')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{item.instrument}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Lot {item.lotSize} | Expiry {item.expiry}
          </div>
        </div>
        <span className={`badge ${positive ? 'badge-green' : 'badge-red'}`}>
          {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {formatPercent(item.changePercent)}
        </span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{formatCurrency(item.ltp)}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
        Underlying: {item.underlying} {item.strike ? `| Strike ${item.strike}` : ''}
      </div>
    </div>
  );
};

const BondCard = ({ item, onOpen }) => {
  const positive = Number(item.dayChangeBps || 0) >= 0;

  return (
    <div className="card" style={{ padding: 16, cursor: 'pointer' }} onClick={() => onOpen(item, 'bonds')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{item.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {item.issuer} | {item.maturity}
          </div>
        </div>
        <span className="badge badge-blue">{item.type}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Yield</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{Number(item.yield).toFixed(2)}%</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Coupon</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{Number(item.coupon).toFixed(2)}%</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Price</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{formatCurrency(item.price)}</div>
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: positive ? 'var(--green)' : 'var(--red)' }}>
        Day change: {positive ? '+' : ''}{Number(item.dayChangeBps).toFixed(2)} bps
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
        <ShieldCheck size={12} /> Rating: {item.rating}
      </div>
    </div>
  );
};

const IPOCard = ({ item, onOpen }) => {
  return (
    <div className="card" style={{ padding: 16, cursor: 'pointer' }} onClick={() => onOpen(item, 'ipo')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{item.company}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.sector} | {item.exchange}</div>
        </div>
        <span className="badge badge-gold">{item.status}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Price Band</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{item.priceBand}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Issue Size</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{item.issueSizeCr} Cr</div>
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <CalendarClock size={12} /> {item.issueOpen} to {item.issueClose}
      </div>
    </div>
  );
};

const DetailModal = ({ details, onClose }) => {
  if (!details) return null;

  const { type, item, news = [], newsLoading } = details;
  const title = type === 'fno' ? item.instrument : type === 'bonds' ? item.name : item.company;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.68)', zIndex: 300, padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="card" style={{ width: 'min(900px, 100%)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>{title}</h3>
          <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={onClose}><X size={14} /></button>
        </div>

        {type === 'fno' && (
          <div className="grid-3" style={{ marginBottom: 14 }}>
            <div className="card" style={{ padding: 12 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last Price</div><div style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrency(item.ltp)}</div></div>
            <div className="card" style={{ padding: 12 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lot Size</div><div style={{ fontSize: 20, fontWeight: 700 }}>{item.lotSize}</div></div>
            <div className="card" style={{ padding: 12 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Change</div><div style={{ fontSize: 20, fontWeight: 700, color: Number(item.changePercent || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatPercent(item.changePercent)}</div></div>
          </div>
        )}

        {type === 'bonds' && (
          <div className="grid-3" style={{ marginBottom: 14 }}>
            <div className="card" style={{ padding: 12 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Yield</div><div style={{ fontSize: 20, fontWeight: 700 }}>{Number(item.yield).toFixed(2)}%</div></div>
            <div className="card" style={{ padding: 12 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Coupon</div><div style={{ fontSize: 20, fontWeight: 700 }}>{Number(item.coupon).toFixed(2)}%</div></div>
            <div className="card" style={{ padding: 12 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Price</div><div style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrency(item.price)}</div></div>
          </div>
        )}

        {type === 'ipo' && (
          <div className="grid-3" style={{ marginBottom: 14 }}>
            <div className="card" style={{ padding: 12 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Price Band</div><div style={{ fontSize: 18, fontWeight: 700 }}>{item.priceBand}</div></div>
            <div className="card" style={{ padding: 12 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lot Size</div><div style={{ fontSize: 18, fontWeight: 700 }}>{item.lotSize}</div></div>
            <div className="card" style={{ padding: 12 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>GMP</div><div style={{ fontSize: 18, fontWeight: 700 }}>{item.gmp}</div></div>
          </div>
        )}

        <div style={{ marginBottom: 16, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7 }}>
          {type === 'fno' && 'F&O instruments are leveraged products. Track open interest, implied volatility, and expiry behavior before taking any directional view.'}
          {type === 'bonds' && 'Bond values are sensitive to interest-rate expectations. Rising yields generally push bond prices lower, while falling yields may support prices.'}
          {type === 'ipo' && 'IPO participation should consider valuation, business quality, lock-in behavior, and listing-day liquidity instead of GMP alone.'}
        </div>

        <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Related News</h4>
        {newsLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 3 }).map((_, index) => <div key={index} className="skeleton" style={{ height: 90 }} />)}
          </div>
        ) : news.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {news.map((article, index) => <NewsCard key={article.id || index} article={article} compact />)}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>No related news found for this instrument.</p>
        )}
      </div>
    </div>
  );
};

export default function Stocks() {
  const [tab, setTab] = useState('equity');
  const [stocks, setStocks] = useState([]);
  const [fno, setFno] = useState([]);
  const [bonds, setBonds] = useState([]);
  const [ipos, setIpos] = useState([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [exchangeFilter, setExchangeFilter] = useState('all');
  const [sortMode, setSortMode] = useState('relevance');
  const [details, setDetails] = useState(null);

  useEffect(() => {
    setLoading(true);
    setLoadError('');

    Promise.all([
      stockAPI.popular().catch(() => ({ data: [] })),
      stockAPI.gainers().catch(() => ({ data: [] })),
      stockAPI.fno().catch(() => ({ data: [] })),
      stockAPI.bonds().catch(() => ({ data: [] })),
      stockAPI.ipos().catch(() => ({ data: [] }))
    ])
      .then(([popularRes, gainersRes, fnoRes, bondsRes, ipoRes]) => {
        const merged = [...(gainersRes.data || []), ...(popularRes.data || [])];
        const deduped = [];
        const seen = new Set();

        for (const stock of merged) {
          const symbol = String(stock.symbol || stock.value || '').trim();
          if (!symbol || seen.has(symbol)) continue;
          seen.add(symbol);
          deduped.push(stock);
        }

        setStocks(deduped.slice(0, 20));
        setFno(Array.isArray(fnoRes.data) ? fnoRes.data : []);
        setBonds(Array.isArray(bondsRes.data) ? bondsRes.data : []);
        setIpos(Array.isArray(ipoRes.data) ? ipoRes.data : []);
        if (!deduped.length && !fnoRes.data?.length && !bondsRes.data?.length && !ipoRes.data?.length) {
          setLoadError('Data providers are delayed right now. Showing limited market feed.');
        }
      })
      .catch(() => {
        setLoadError('Unable to fetch live market data right now. Please refresh shortly.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      if (tab !== 'equity') return;

      setSearching(true);
      try {
        const response = await stockAPI.search(query.trim());
        setSearchResults(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        setSearchResults([]);
        setLoadError('Search is temporarily unavailable. Please try again.');
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query, tab]);

  const openDetails = async (item, type) => {
    const queryText = type === 'fno'
      ? `${item.instrument} futures options india`
      : type === 'bonds'
        ? `${item.name} bond india yield`
        : `${item.company} ipo india`;

    const category = type === 'fno' ? 'fno' : type === 'bonds' ? 'bonds' : 'india';

    setDetails({ type, item, news: [], newsLoading: true });
    try {
      const response = await newsAPI.search(queryText, category, 8);
      setDetails({ type, item, news: Array.isArray(response.data) ? response.data : [], newsLoading: false });
    } catch (err) {
      setDetails({ type, item, news: [], newsLoading: false });
    }
  };

  const filteredFnO = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return fno;
    return fno.filter((item) => `${item.instrument} ${item.underlying}`.toLowerCase().includes(text));
  }, [fno, query]);

  const filteredBonds = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return bonds;
    return bonds.filter((item) => `${item.name} ${item.issuer} ${item.type}`.toLowerCase().includes(text));
  }, [bonds, query]);

  const filteredIpos = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return ipos;
    return ipos.filter((item) => `${item.company} ${item.sector} ${item.exchange}`.toLowerCase().includes(text));
  }, [ipos, query]);

  const equityDisplay = query.trim() ? searchResults : stocks;

  const filteredEquityDisplay = useMemo(() => {
    const raw = [...equityDisplay];

    const filtered = raw.filter((stock) => {
      const exchange = String(stock.exchange || '').toUpperCase();
      if (exchangeFilter === 'nse') return exchange.includes('NSE');
      if (exchangeFilter === 'bse') return exchange.includes('BSE') || exchange.includes('BOMBAY');
      return true;
    });

    if (sortMode === 'change') {
      filtered.sort((a, b) => Math.abs(Number(b.changePercent || 0)) - Math.abs(Number(a.changePercent || 0)));
    } else if (sortMode === 'marketCap') {
      filtered.sort((a, b) => Number(b.marketCap || 0) - Number(a.marketCap || 0));
    } else if (sortMode === 'price') {
      filtered.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    }

    return filtered;
  }, [equityDisplay, exchangeFilter, sortMode]);

  const equityStats = useMemo(() => {
    const list = filteredEquityDisplay;
    const nseCount = list.filter((stock) => String(stock.exchange || '').toUpperCase().includes('NSE')).length;
    const bseCount = list.filter((stock) => {
      const exchange = String(stock.exchange || '').toUpperCase();
      return exchange.includes('BSE') || exchange.includes('BOMBAY');
    }).length;
    const avgChange = list.length
      ? list.reduce((sum, stock) => sum + Number(stock.changePercent || 0), 0) / list.length
      : 0;

    return {
      total: list.length,
      nseCount,
      bseCount,
      avgChange
    };
  }, [filteredEquityDisplay]);

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {VIEW_TABS.map((item) => (
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
              cursor: 'pointer'
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 20, maxWidth: 460, position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            tab === 'equity'
              ? 'Search NSE/BSE stocks...'
              : tab === 'fno'
                ? 'Search F&O contracts...'
                : tab === 'bonds'
                  ? 'Search bonds...'
                  : 'Search IPOs...'
          }
          style={{ paddingLeft: 36 }}
        />
      </div>

      {tab === 'equity' && (
        <div style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {EXCHANGE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setExchangeFilter(filter.value)}
                className={exchangeFilter === filter.value ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ padding: '6px 11px', fontSize: 12 }}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value)}
            style={{ width: 'auto', minWidth: 170, padding: '7px 10px', fontSize: 12 }}
          >
            {EQUITY_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      )}

      {tab === 'equity' && !loading && (
        <div style={{ marginBottom: 14, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <div className="card" style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Visible Stocks</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{equityStats.total}</div>
          </div>
          <div className="card" style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>NSE</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{equityStats.nseCount}</div>
          </div>
          <div className="card" style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>BSE</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{equityStats.bseCount}</div>
          </div>
          <div className="card" style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Avg Change</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: equityStats.avgChange >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {formatPercent(equityStats.avgChange)}
            </div>
          </div>
        </div>
      )}

      {loadError && (
        <div className="card" style={{ marginBottom: 14, padding: '10px 12px', borderColor: 'rgba(248,113,113,0.35)', color: 'var(--text-secondary)' }}>
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="grid-4">
          {Array.from({ length: 12 }).map((_, index) => <div key={index} className="skeleton" style={{ height: 104 }} />)}
        </div>
      ) : (
        <>
          {tab === 'equity' && (
            <>
              <SectionHint text={query.trim() ? (searching ? 'Searching live NSE/BSE quotes...' : `${filteredEquityDisplay.length} matched equities`) : `Showing ${filteredEquityDisplay.length} curated Indian equities`} />
              {searching ? (
                <div className="grid-4">
                  {Array.from({ length: 8 }).map((_, index) => <div key={index} className="skeleton" style={{ height: 104 }} />)}
                </div>
              ) : (
                <div className="grid-4">
                  {filteredEquityDisplay.map((stock, index) => (
                  <StockCard
                    key={stock.symbol || stock.value || index}
                    stock={{
                      symbol: stock.symbol || stock.value,
                      name: stock.name || stock.longName,
                      price: Number.isFinite(Number(stock.price)) ? Number(stock.price) : 0,
                      change: Number.isFinite(Number(stock.change)) ? Number(stock.change) : 0,
                      changePercent: Number.isFinite(Number(stock.changePercent)) ? Number(stock.changePercent) : 0,
                      exchange: stock.exchange || (String(stock.symbol || stock.value || '').endsWith('.BO') ? 'BSE' : 'NSE'),
                      isMock: Boolean(stock.isMock)
                    }}
                  />
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'fno' && (
            <>
              <SectionHint text={`${filteredFnO.length} F&O contracts with detail views and related market context`} />
              <div className="grid-3">
                {filteredFnO.map((item) => <FnOCard key={item.id} item={item} onOpen={openDetails} />)}
              </div>
            </>
          )}

          {tab === 'bonds' && (
            <>
              <SectionHint text={`${filteredBonds.length} India-focused bond instruments with yield and risk snapshots`} />
              <div className="grid-2">
                {filteredBonds.map((item) => <BondCard key={item.id} item={item} onOpen={openDetails} />)}
              </div>
            </>
          )}

          {tab === 'ipo' && (
            <>
              <SectionHint text={`${filteredIpos.length} IPO opportunities with issue windows and pricing`} />
              <div className="grid-2">
                {filteredIpos.map((item) => <IPOCard key={item.id} item={item} onOpen={openDetails} />)}
              </div>
            </>
          )}

          {((tab === 'equity' && filteredEquityDisplay.length === 0 && !searching)
            || (tab === 'fno' && filteredFnO.length === 0)
            || (tab === 'bonds' && filteredBonds.length === 0)
            || (tab === 'ipo' && filteredIpos.length === 0)) && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>No results</div>
              <p>Try a different keyword.</p>
            </div>
          )}
        </>
      )}

      <DetailModal details={details} onClose={() => setDetails(null)} />
    </div>
  );
}