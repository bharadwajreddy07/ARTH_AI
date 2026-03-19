import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, Bot, User, RefreshCw, Zap, TrendingUp, HelpCircle, BarChart2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { aiAPI } from '../utils/api';

const SUGGESTIONS = [
  { icon: <TrendingUp size={14} />,  text: 'What is a P/E ratio and why does it matter?' },
  { icon: <Sparkles size={14} />,    text: 'Explain SIP investing for beginners' },
  { icon: <BarChart2 size={14} />,   text: 'How does RBI rate hike affect the stock market?' },
  { icon: <HelpCircle size={14} />,  text: 'What is the difference between Nifty 50 and Sensex?' },
  { icon: <Zap size={14} />,         text: 'Best strategies for long-term wealth creation in India' },
  { icon: <TrendingUp size={14} />,  text: 'How to analyze a mutual fund before investing?' },
];

const MessageBubble = ({ msg }) => {
  const isUser = msg.role === 'user';
  return (
    <div style={{
      display: 'flex',
      gap: 12,
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
      animation: 'fadeIn 0.25s ease'
    }}>
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, flexShrink: 0,
        borderRadius: '50%',
        background: isUser ? 'var(--bg-overlay)' : 'var(--gold-glow)',
        border: isUser ? '1px solid var(--border)' : '1px solid rgba(232,196,106,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isUser
          ? <User size={14} color="var(--text-secondary)" />
          : <Sparkles size={14} color="var(--gold)" />
        }
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth: '72%',
        background: isUser ? 'var(--bg-elevated)' : 'var(--bg-surface)',
        border: `1px solid ${isUser ? 'var(--border)' : 'rgba(232,196,106,0.12)'}`,
        borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
        padding: '12px 16px',
      }}>
        {msg.loading ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 0' }}>
            {[0, 150, 300].map(d => (
              <div key={d} style={{
                width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)',
                animation: 'pulse-glow 1.2s ease-in-out infinite',
                animationDelay: `${d}ms`
              }} />
            ))}
          </div>
        ) : (
          <div style={{
            fontSize: 13.5,
            lineHeight: 1.75,
            color: isUser ? 'var(--text-primary)' : 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}>
            {msg.content}
          </div>
        )}
        {msg.isFallback && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Bot size={10} /> AI response running with limited provider availability
          </div>
        )}
        {msg.isFallback && msg.fallbackReason && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            Reason: {msg.fallbackReason}
          </div>
        )}
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, textAlign: isUser ? 'right' : 'left' }}>
          {new Date(msg.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
};

export default function AIChat() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Namaste! I am Arth, your intelligent financial co-pilot.\n\nI can help you:\n- Understand market movements and key concepts\n- Analyze stocks, mutual funds, F&O context, and bonds\n- Explain how news can affect sectors and portfolios\n- Run practical what-if scenarios for Indian markets\n\nWhat would you like to explore?",
      timestamp: Date.now()
    }
  ]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState(null);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    aiAPI.status()
      .then(async (res) => {
        setAiStatus(res.data);

        if (!res.data?.openai?.configured || res.data?.openai?.lastError) {
          try {
            const diagnostics = await aiAPI.diagnostics();
            setAiStatus((prev) => ({
              ...(prev || {}),
              diagnostics: diagnostics.data
            }));
          } catch (err) {
            // Ignore diagnostics errors at bootstrap.
          }
        }
      })
      .catch(() => setAiStatus(null));
  }, []);

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: msg, timestamp: Date.now() }]);

    // Add loading bubble
    const loadingId = Date.now() + 1;
    setMessages(prev => [...prev, { role: 'assistant', content: '', loading: true, timestamp: loadingId }]);
    setLoading(true);

    try {
      // Extract stock context from message
      const symbolMatch = msg.match(/\b([A-Z]{2,10})(\.NS|\.BO)?\b/);
      const context = symbolMatch ? { symbol: symbolMatch[0].includes('.') ? symbolMatch[0] : symbolMatch[0] + '.NS' } : {};

      const res = await aiAPI.chat(msg, context);
      setMessages(prev => prev.map(m =>
        m.timestamp === loadingId
          ? {
              role: 'assistant',
              content: res.data.message,
              isFallback: res.data.isFallback,
              fallbackReason: res.data.fallbackReason,
              timestamp: loadingId
            }
          : m
      ));

      if (res.data.isFallback && res.data.fallbackReason) {
        toast.error(`AI fallback: ${res.data.fallbackReason}`);
      }
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.timestamp === loadingId
          ? { role: 'assistant', content: 'Sorry, I encountered an error. Please check your API configuration and try again.', timestamp: loadingId }
          : m
      ));
      toast.error('AI service unavailable');
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: "Chat cleared. How can I help you with your investments today?",
      timestamp: Date.now()
    }]);
  };

  return (
    <div style={{
      height: 'calc(100vh - var(--topbar-height) - 56px)',
      display: 'flex',
      flexDirection: 'column',
      gap: 0
    }}>

      {/* Header strip */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 0 16px',
        borderBottom: '1px solid var(--border)',
        marginBottom: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36,
            background: 'var(--gold-glow)',
            border: '1px solid rgba(232,196,106,0.3)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Sparkles size={16} color="var(--gold)" />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Arth AI</div>
            <div style={{
              fontSize: 11,
              color: aiStatus?.openai?.configured && !aiStatus?.openai?.lastError ? 'var(--green)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
              <div style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: aiStatus?.openai?.configured && !aiStatus?.openai?.lastError ? 'var(--green)' : 'var(--text-muted)',
                animation: 'pulse-glow 2s infinite'
              }} />
              {aiStatus?.openai?.configured && !aiStatus?.openai?.lastError
                ? `Online - Powered by ${aiStatus?.openai?.model || 'OpenAI'}`
                : `Fallback mode - ${aiStatus?.openai?.lastError || 'run diagnostics'}`}
            </div>
          </div>
        </div>
        <button onClick={clearChat} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}>
          <RefreshCw size={12} /> Clear
        </button>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, paddingRight: 4 }}>
        {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions (show only on first load) */}
      {messages.length <= 1 && (
        <div style={{ marginTop: 16, marginBottom: 12 }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Suggested questions
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {SUGGESTIONS.map((s, i) => (
              <button key={i} onClick={() => send(s.text)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 12.5,
                color: 'var(--text-secondary)',
                transition: 'all 0.15s',
                lineHeight: 1.4
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}
              >
                <span style={{ color: 'var(--gold)', flexShrink: 0 }}>{s.icon}</span>
                {s.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{
        display: 'flex', gap: 10,
        padding: '16px 0 0',
        borderTop: '1px solid var(--border)',
        marginTop: 12
      }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Ask about stocks, markets, funds, concepts… (Enter to send)"
            rows={1}
            style={{
              resize: 'none',
              paddingRight: 14,
              lineHeight: 1.6,
              minHeight: 44,
              maxHeight: 120,
              overflow: 'auto',
              borderRadius: 'var(--radius-lg)',
            }}
          />
        </div>
        <button
          onClick={() => send()}
          disabled={!input.trim() || loading}
          className="btn btn-primary"
          style={{
            padding: '0 18px', height: 44, flexShrink: 0,
            opacity: !input.trim() || loading ? 0.5 : 1
          }}
        >
          {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Send size={15} />}
        </button>
      </div>

      {/* Disclaimer */}
      {aiStatus?.diagnostics?.reason && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>
          Diagnostics: {aiStatus.diagnostics.reason}
        </p>
      )}
      <p style={{ fontSize: 10.5, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>
        ⚠️ Arth AI provides educational content only — not financial advice. Always consult a SEBI-registered advisor.
      </p>
    </div>
  );
}
