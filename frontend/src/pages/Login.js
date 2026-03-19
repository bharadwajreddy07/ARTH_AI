import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Eye, EyeOff, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [form, setForm]       = useState({ email: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login }  = useAuth();
  const navigate   = useNavigate();

  const handle = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return toast.error('Fill in all fields');
    setLoading(true);
    try {
      await login(form.email, form.password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #090b10 0%, #0f1420 60%, #0a0b0f 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 22,
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background glow */}
      <div style={{
        position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 600, height: 600,
        background: 'radial-gradient(circle, rgba(232,196,106,0.06) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      {/* Decorative grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
        opacity: 0.4,
        pointerEvents: 'none'
      }} />

      <div className="login-grid-fallback" style={{
        width: '100%',
        maxWidth: 980,
        display: 'grid',
        gridTemplateColumns: '1.05fr 1fr',
        gap: 14,
        position: 'relative',
        animation: 'fadeIn 0.4s ease'
      }}>
        <div style={{
          background: 'linear-gradient(160deg, rgba(232,196,106,0.16), rgba(96,165,250,0.09))',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 'var(--radius-xl)',
          padding: '30px 28px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: 520
        }}>
          <div>
            <div style={{
              width: 54, height: 54,
              background: 'var(--gold)',
              borderRadius: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 16
            }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: '#0a0b0f', lineHeight: 1 }}>A</span>
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 46, lineHeight: 1.03, marginBottom: 12 }}>Arth</h1>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Intelligent Financial Co-pilot for retail investors.
              Understand markets, compare assets, and act with confidence.
            </p>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {[
              'Live NSE and BSE market snapshots',
              'AI explanations with retrieval context',
              'News sentiment and mutual fund tracking'
            ].map((line) => (
              <div key={line} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 13, color: 'var(--text-secondary)'
              }}>
                <TrendingUp size={14} color="var(--gold)" />
                {line}
              </div>
            ))}
          </div>
        </div>

        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          padding: '32px 28px',
          boxShadow: 'var(--shadow-card)',
          minHeight: 520,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center'
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Sign in</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>Access your personalized market dashboard</p>

          <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Email address
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{ paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)'
                }}>
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', height: 42, marginTop: 4 }} disabled={loading}>
              {loading ? <span className="spinner" /> : 'Sign in'}
            </button>
          </form>

          {/* Quick start hint */}
          <div style={{
            marginTop: 16,
            padding: '10px 14px',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            fontSize: 12, color: 'var(--text-muted)'
          }}>
            <span style={{ color: 'var(--gold)', fontWeight: 600 }}>Quick start:</span> Register a new account to get started immediately.
          </div>

          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 20 }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: 'var(--gold)', textDecoration: 'none', fontWeight: 500 }}>
              Create one free
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}
