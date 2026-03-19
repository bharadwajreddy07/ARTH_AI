import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function FloatingAIButton() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  if (loading || location.pathname === '/chat') return null;

  const openAI = () => {
    navigate(user ? '/chat' : '/login');
  };

  return (
    <button
      type="button"
      onClick={openAI}
      className="floating-ai-button"
      title={user ? 'Open Arth AI' : 'Sign in to use Arth AI'}
      aria-label={user ? 'Open Arth AI' : 'Sign in to use Arth AI'}
    >
      <MessageSquare size={16} />
      <span>AI</span>
    </button>
  );
}
