import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, TrendingUp, PieChart, Briefcase,
  Star, Newspaper, MessageSquare, LogOut
} from 'lucide-react';

const NAV = [
  { to: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/stocks',        icon: TrendingUp,       label: 'Stocks' },
  { to: '/mutual-funds',  icon: PieChart,         label: 'Mutual Funds' },
  { to: '/portfolio',     icon: Briefcase,        label: 'Portfolio' },
  { to: '/watchlist',     icon: Star,             label: 'Watchlist' },
  { to: '/news',          icon: Newspaper,        label: 'News' },
  { to: '/chat',          icon: MessageSquare,    label: 'Arth AI' },
];

export default function Sidebar({ isMobile = false, isOpen = true, onClose = () => {} }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
    onClose();
  };

  return (
    <>
      {isMobile && isOpen && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            border: 'none',
            zIndex: 95,
            cursor: 'pointer'
          }}
        />
      )}
      <aside style={{
        width: 'var(--sidebar-width)',
        minHeight: '100vh',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 100,
        padding: '0 0 24px',
        transform: isMobile && !isOpen ? 'translateX(-110%)' : 'translateX(0)',
        transition: 'transform 0.2s ease'
      }}>
      {/* Logo */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="arth-logo-mark arth-logo-mark-sm" aria-hidden="true">A</div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--gold)', lineHeight: 1 }}>Arth</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Financial Co-pilot</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 500,
            transition: 'all 0.15s',
            background: isActive ? 'var(--bg-overlay)' : 'transparent',
            color: isActive ? 'var(--gold)' : 'var(--text-secondary)',
            borderLeft: isActive ? '2px solid var(--gold)' : '2px solid transparent',
          })} onClick={() => isMobile && onClose()}>
            <Icon size={16} />
            {label}
            {label === 'Arth AI' && (
              <span style={{
                marginLeft: 'auto',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.06em',
                background: 'var(--gold-glow)',
                color: 'var(--gold)',
                padding: '2px 6px',
                borderRadius: 99,
                border: '1px solid rgba(232,196,106,0.3)'
              }}>AI</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-elevated)'
        }}>
          <div style={{
            width: 32, height: 32,
            background: 'var(--gold-glow)',
            border: '1px solid rgba(232,196,106,0.3)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 600, color: 'var(--gold)'
          }}>
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.email || 'Arth member'}
            </div>
          </div>
          <button onClick={handleLogout} title="Logout" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', padding: 4, borderRadius: 6,
            display: 'flex', alignItems: 'center', transition: 'color 0.15s'
          }}>
            <LogOut size={14} />
          </button>
        </div>
      </div>
      </aside>
    </>
  );
}
