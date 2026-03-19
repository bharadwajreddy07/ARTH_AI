import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency, formatPercent, getChangeClass, abbreviateSymbol } from '../../utils/format';

export default function StockCard({ stock, compact = false }) {
  const navigate = useNavigate();
  const price = Number(stock.price);
  const hasPrice = Number.isFinite(price) && price > 0;
  const change = Number(stock.change);
  const changePercent = Number(stock.changePercent);
  const isPos = Number.isFinite(changePercent) ? changePercent >= 0 : true;
  const derivedExchange = stock.exchange || (String(stock.symbol || '').endsWith('.BO') ? 'BSE' : 'NSE');

  return (
    <div
      className="card"
      onClick={() => navigate(`/stocks/${stock.symbol}`)}
      style={{ cursor: 'pointer', transition: 'all 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-card)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: compact ? 8 : 12 }}>
        <div>
          <div style={{
            fontWeight: 700,
            fontSize: compact ? 14 : 15,
            color: 'var(--text-primary)',
            letterSpacing: '0.02em'
          }}>
            {abbreviateSymbol(stock.symbol)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {stock.name}
          </div>
          <div style={{
            marginTop: 4,
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            border: '1px solid var(--border)',
            borderRadius: 999,
            padding: '1px 7px'
          }}>
            {derivedExchange}
          </div>
          {stock.isMock && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              Limited feed
            </div>
          )}
        </div>
        <span className={`badge ${isPos ? 'badge-green' : 'badge-red'}`}>
          {isPos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {Number.isFinite(changePercent) ? formatPercent(changePercent) : '--'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontSize: compact ? 18 : 22, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {hasPrice ? formatCurrency(price) : '--'}
        </div>
        <div style={{ fontSize: 12, color: Number.isFinite(change) ? (getChangeClass(change) === 'positive' ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)', fontWeight: 500 }}>
          {Number.isFinite(change) ? `${change > 0 ? '+' : ''}${formatCurrency(change)}` : 'Price unavailable'}
        </div>
      </div>
    </div>
  );
}
