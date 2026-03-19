import React from 'react';
import { ExternalLink } from 'lucide-react';
import { timeAgo, getSentimentColor } from '../../utils/format';

export default function NewsCard({ article, compact = false }) {
  const sentimentColor = getSentimentColor(article.sentiment?.label);
  const confidenceScore = Number(article.confidenceScore);
  const confidenceLabel = article.confidenceLabel || (confidenceScore >= 75 ? 'High' : confidenceScore >= 55 ? 'Medium' : 'Low');
  const confidenceColor = confidenceLabel === 'High'
    ? '#34d399'
    : confidenceLabel === 'Medium'
      ? '#f59e0b'
      : '#f87171';

  return (
    <div className="card" style={{ padding: compact ? 14 : 20 }}>
      <div style={{ display: 'flex', gap: 14 }}>
        {!compact && article.image && (
          <img
            src={article.image}
            alt=""
            style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: sentimentColor, background: `${sentimentColor}20`, padding: '2px 8px', borderRadius: 99
            }}>
              {article.sentiment?.label || 'neutral'}
            </span>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: confidenceColor,
              background: `${confidenceColor}1f`,
              padding: '2px 8px',
              borderRadius: 99
            }}>
              {confidenceLabel}{Number.isFinite(confidenceScore) ? ` ${confidenceScore}` : ''}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{article.source}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{timeAgo(article.datetime)}</span>
          </div>
          <a href={article.url} target="_blank" rel="noopener noreferrer" style={{
            display: 'block',
            fontSize: compact ? 13 : 14,
            fontWeight: 600,
            color: 'var(--text-primary)',
            textDecoration: 'none',
            lineHeight: 1.4,
            marginBottom: 6
          }}
          onMouseEnter={e => e.target.style.color = 'var(--gold)'}
          onMouseLeave={e => e.target.style.color = 'var(--text-primary)'}
          >
            {article.headline}
            <ExternalLink size={11} style={{ marginLeft: 4, opacity: 0.5, verticalAlign: 'middle' }} />
          </a>
          {!compact && article.summary && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', display: '-webkit-box', overflow: 'hidden' }}>
              {article.summary}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
