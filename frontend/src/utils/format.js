export const formatCurrency = (val, digits = 2) => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const num = parseFloat(val);
  if (Math.abs(num) >= 1e7) return `₹${(num / 1e7).toFixed(2)}Cr`;
  if (Math.abs(num) >= 1e5) return `₹${(num / 1e5).toFixed(2)}L`;
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
};

export const formatNumber = (val) => {
  if (val === null || val === undefined) return '—';
  const num = parseFloat(val);
  if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (Math.abs(num) >= 1e7) return `${(num / 1e7).toFixed(2)}Cr`;
  if (Math.abs(num) >= 1e5) return `${(num / 1e5).toFixed(2)}L`;
  return num.toLocaleString('en-IN');
};

export const formatPercent = (val, showSign = true) => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const num = parseFloat(val);
  const sign = showSign && num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
};

export const formatChange = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const num = parseFloat(val);
  const sign = num > 0 ? '+' : '';
  return `${sign}${formatCurrency(num)}`;
};

export const getChangeClass = (val) => {
  const num = parseFloat(val);
  if (isNaN(num) || num === 0) return 'neutral';
  return num > 0 ? 'positive' : 'negative';
};

export const getSentimentColor = (label) => {
  if (label === 'positive') return 'var(--green)';
  if (label === 'negative') return 'var(--red)';
  return 'var(--text-secondary)';
};

export const timeAgo = (dateStr) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export const abbreviateSymbol = (symbol) =>
  symbol?.replace('.NS', '').replace('.BO', '') || symbol;
