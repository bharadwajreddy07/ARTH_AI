import React, { useMemo, useState, useEffect } from 'react';
import { Trash2, Briefcase, LineChart } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import toast from 'react-hot-toast';
import { portfolioAPI } from '../utils/api';
import { formatCurrency, formatPercent } from '../utils/format';

const COLORS = ['#e8c46a', '#60a5fa', '#4ade80', '#f87171', '#a78bfa', '#fb923c', '#34d399', '#f472b6'];

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default function Portfolio() {
  const [portfolio, setPortfolio] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([portfolioAPI.get(), portfolioAPI.analytics()])
      .then(([portfolioRes, analyticsRes]) => {
        setPortfolio(portfolioRes.data);
        setAnalytics(analyticsRes.data);
      })
      .catch(() => toast.error('Failed to load portfolio'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const remove = async (symbol) => {
    if (!window.confirm(`Remove ${symbol} from portfolio?`)) return;
    try {
      await portfolioAPI.removeHolding(symbol);
      toast.success('Removed');
      load();
    } catch {
      toast.error('Error removing holding');
    }
  };

  const holdings = portfolio?.holdings || [];
  const totals = analytics?.totals || {};

  const totalInvested = toNumber(totals.invested, holdings.reduce((sum, h) => sum + toNumber(h.quantity) * toNumber(h.avgBuyPrice), 0));
  const currentValue = toNumber(totals.currentValue, holdings.reduce((sum, h) => sum + toNumber(h.quantity) * toNumber(h.currentPrice || h.avgBuyPrice), 0));
  const totalPnL = toNumber(totals.pnl, currentValue - totalInvested);
  const totalPnLPct = toNumber(totals.pnlPercent, totalInvested ? (totalPnL / totalInvested) * 100 : 0);

  const history = Array.isArray(analytics?.history) ? analytics.history : [];
  const byHolding = Array.isArray(analytics?.byHolding) ? analytics.byHolding : [];
  const byType = Array.isArray(analytics?.byType) ? analytics.byType : [];

  const pieData = useMemo(() => {
    if (byType.length) {
      return byType.map((item) => ({
        name: String(item.type || 'other').replace('_', ' ').toUpperCase(),
        value: toNumber(item.currentValue)
      }));
    }

    return holdings.map((holding) => ({
      name: holding.symbol?.replace('.NS', '').replace('.BO', '') || 'N/A',
      value: toNumber(holding.quantity) * toNumber(holding.currentPrice || holding.avgBuyPrice)
    }));
  }, [byType, holdings]);

  const topContributors = useMemo(() => {
    const base = byHolding.length ? byHolding : holdings.map((holding) => {
      const invested = toNumber(holding.quantity) * toNumber(holding.avgBuyPrice);
      const value = toNumber(holding.quantity) * toNumber(holding.currentPrice || holding.avgBuyPrice);
      const pnl = value - invested;
      return {
        symbol: holding.symbol,
        invested,
        currentValue: value,
        pnl,
        pnlPercent: invested ? (pnl / invested) * 100 : 0
      };
    });

    return base
      .slice()
      .sort((a, b) => Math.abs(toNumber(b.pnl)) - Math.abs(toNumber(a.pnl)))
      .slice(0, 8)
      .map((item) => ({
        name: String(item.symbol || 'N/A').replace('.NS', '').replace('.BO', ''),
        pnlPercent: Number(toNumber(item.pnlPercent).toFixed(2))
      }));
  }, [byHolding, holdings]);

  const trendData = useMemo(() => {
    return history.map((point) => ({
      date: point.date,
      value: toNumber(point.value),
      invested: toNumber(point.invested),
      pnl: toNumber(point.pnl)
    }));
  }, [history]);

  if (loading) return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 80 }} />)}
    </div>
  );

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Portfolio Analytics</div>
          <h3 style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>Track return quality, not only P&L</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
          <LineChart size={14} /> Last {trendData.length || 0} sessions
        </div>
      </div>

      <div className="grid-3">
        {[
          { label: 'Total Invested', value: formatCurrency(totalInvested), sub: `${holdings.length} holdings` },
          { label: 'Current Value', value: formatCurrency(currentValue), sub: 'Live prices' },
          { label: 'Total P&L', value: `${totalPnL >= 0 ? '+' : ''}${formatCurrency(totalPnL)}`, sub: formatPercent(totalPnLPct), positive: totalPnL >= 0 }
        ].map(({ label, value, sub, positive }) => (
          <div key={label} className="card" style={{ borderLeft: positive !== undefined ? `3px solid ${positive ? 'var(--green)' : 'var(--red)'}` : '3px solid var(--gold)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: positive !== undefined ? (positive ? 'var(--green)' : 'var(--red)') : 'var(--text-primary)' }}>{value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {holdings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
          <Briefcase size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
          <h3 style={{ fontSize: 18, marginBottom: 8, color: 'var(--text-secondary)' }}>Empty Portfolio</h3>
          <p style={{ fontSize: 13 }}>Browse stocks and click "Add to Portfolio" to track your holdings.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Portfolio Trend (Value vs Invested)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="portfolioValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e8c46a" stopOpacity={0.38} />
                      <stop offset="95%" stopColor="#e8c46a" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fill: '#8b8fa8', fontSize: 11 }} hide={trendData.length > 100} />
                  <YAxis tick={{ fill: '#8b8fa8', fontSize: 11 }} tickFormatter={(value) => formatCurrency(value, 0)} />
                  <Tooltip
                    formatter={(value, key) => [formatCurrency(value), key === 'value' ? 'Current Value' : key === 'invested' ? 'Invested' : 'P&L']}
                    contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="invested" stroke="#60a5fa" strokeWidth={1.8} fill="transparent" />
                  <Area type="monotone" dataKey="value" stroke="#e8c46a" strokeWidth={2.2} fill="url(#portfolioValue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Allocation by Type</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={48} outerRadius={82} dataKey="value" stroke="none">
                    {pieData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {pieData.map((item, index) => (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[index % COLORS.length] }} />
                      <span style={{ color: 'var(--text-secondary)' }}>{item.name}</span>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                      {currentValue > 0 ? ((toNumber(item.value) / currentValue) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Top Contributors (P&L %)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topContributors}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fill: '#8b8fa8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#8b8fa8', fontSize: 11 }} />
                <Tooltip formatter={(value) => formatPercent(value)} contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Legend />
                <Bar dataKey="pnlPercent" name="P&L %" radius={[6, 6, 0, 0]}>
                  {topContributors.map((item) => (
                    <Cell key={item.name} fill={toNumber(item.pnlPercent) >= 0 ? '#4ade80' : '#f87171'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Holdings</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)' }}>
                    {['Stock', 'Qty', 'Avg Price', 'Current', 'Invested', 'Value', 'P&L', ''].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h, i) => {
                    const invested = toNumber(h.quantity) * toNumber(h.avgBuyPrice);
                    const current = toNumber(h.quantity) * toNumber(h.currentPrice || h.avgBuyPrice);
                    const pnl = current - invested;
                    const pnlPct = invested ? (pnl / invested) * 100 : 0;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={(event) => { event.currentTarget.style.background = ''; }}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{h.symbol?.replace('.NS', '').replace('.BO', '')}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{h.type}</div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13 }}>{h.quantity}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13 }}>{formatCurrency(h.avgBuyPrice)}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13 }}>{formatCurrency(h.currentPrice || h.avgBuyPrice)}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13 }}>{formatCurrency(invested)}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13 }}>{formatCurrency(current)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                          </div>
                          <div style={{ fontSize: 11, color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {formatPercent(pnlPct)}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <button onClick={() => remove(h.symbol)} className="btn btn-danger" style={{ padding: '4px 8px', fontSize: 11 }}>
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
