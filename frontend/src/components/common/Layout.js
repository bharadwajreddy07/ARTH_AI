import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Sidebar from './Sidebar';

const PAGE_TITLES = {
  '/dashboard':    'Dashboard',
  '/stocks':       'Stocks',
  '/mutual-funds': 'Mutual Funds',
  '/portfolio':    'Portfolio',
  '/watchlist':    'Watchlist',
  '/news':         'News',
  '/chat':         'Arth AI',
};

export default function Layout() {
  const { pathname } = useLocation();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [pathname, isMobile]);

  const base = '/' + pathname.split('/')[1];
  const title = PAGE_TITLES[base] || 'Arth';

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar isMobile={isMobile} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ marginLeft: isMobile ? 0 : 'var(--sidebar-width)', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div style={{
          height: 'var(--topbar-height)',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 28px',
          position: 'sticky',
          top: 0,
          zIndex: 50
        }}>
          {isMobile && (
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                borderRadius: 8,
                width: 34,
                height: 34,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
                cursor: 'pointer'
              }}
              aria-label="Toggle navigation"
            >
              {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
          )}
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 20 : 22, color: 'var(--text-primary)' }}>{title}</h1>
        </div>
        <main style={{ flex: 1, padding: isMobile ? '20px 16px' : '28px', overflow: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
