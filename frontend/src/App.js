import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/common/Layout';
import Dashboard from './pages/Dashboard';
import Stocks from './pages/Stocks';
import StockDetail from './pages/StockDetail';
import MutualFunds from './pages/MutualFunds';
import Portfolio from './pages/Portfolio';
import Watchlist from './pages/Watchlist';
import News from './pages/News';
import AIChat from './pages/AIChat';
import Login from './pages/Login';
import Register from './pages/Register';
import Landing from './pages/Landing';
import FloatingAIButton from './components/common/FloatingAIButton';
import './styles/globals.css';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg-base)' }}>
      <div className="spinner" style={{ width:32, height:32 }} />
    </div>
  );
  return user ? children : <Navigate to="/login" />;
};

const PublicRoute = ({ children }) => {
  const { user } = useAuth();
  return user ? <Navigate to="/dashboard" /> : children;
};

const HomeRoute = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" /> : <Landing />;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              fontFamily: 'var(--font-body)',
              fontSize: '13px'
            }
          }}
        />
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard"      element={<Dashboard />} />
            <Route path="/stocks"         element={<Stocks />} />
            <Route path="/stocks/:symbol" element={<StockDetail />} />
            <Route path="/mutual-funds"   element={<MutualFunds />} />
            <Route path="/portfolio"      element={<Portfolio />} />
            <Route path="/watchlist"      element={<Watchlist />} />
            <Route path="/news"           element={<News />} />
            <Route path="/chat"           element={<AIChat />} />
          </Route>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        <FloatingAIButton />
      </BrowserRouter>
    </AuthProvider>
  );
}
