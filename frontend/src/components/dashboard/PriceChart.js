import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { stockAPI, mfAPI } from '../../utils/api';
import { formatCurrency } from '../../utils/format';

const PERIODS = [
  { label: '1W', value: '1w' },
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '1Y', value: '1y' },
  { label: '5Y', value: '5y' },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-accent)',
      borderRadius: 'var(--radius-md)',
      padding: '8px 12px',
      fontSize: 12
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ color: 'var(--gold)', fontWeight: 700, fontSize: 14 }}>
        {formatCurrency(payload[0].value)}
      </div>
    </div>
  );
};

export default function PriceChart({ symbol, type = 'stock', height = 220 }) {
  const [data, setData]     = useState([]);
  const [period, setPeriod] = useState('3mo');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    stockAPI.history(symbol, period)
      .then(res => {
        const raw = Array.isArray(res.data) ? res.data : [];
        const formatted = raw.map(d => ({
          date: d.date,
          price: parseFloat(d.close || d.nav || 0)
        })).filter(d => d.price > 0);
        setData(formatted);
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [symbol, period]);

  const isUp = data.length >= 2 && data[data.length - 1]?.price >= data[0]?.price;
  const strokeColor = isUp ? 'var(--green)' : 'var(--red)';
  const fillId = `fill_${symbol.replace(/[^a-zA-Z]/g, '')}`;

  return (
    <div>
      {/* Period selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {PERIODS.map(p => (
          <button key={p.value} onClick={() => setPeriod(p.value)} style={{
            padding: '4px 12px',
            borderRadius: 'var(--radius-sm)',
            border: period === p.value ? '1px solid var(--gold-dim)' : '1px solid var(--border)',
            background: period === p.value ? 'var(--gold-glow)' : 'transparent',
            color: period === p.value ? 'var(--gold)' : 'var(--text-secondary)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s'
          }}>{p.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="skeleton" style={{ height }} />
      ) : data.length === 0 ? (
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          No chart data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.25} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              tickFormatter={d => d?.slice(5)}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={60}
              tickFormatter={v => `₹${v >= 1000 ? (v/1000).toFixed(1)+'k' : v.toFixed(0)}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="price"
              stroke={strokeColor}
              strokeWidth={2}
              fill={`url(#${fillId})`}
              dot={false}
              activeDot={{ r: 4, fill: strokeColor, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
