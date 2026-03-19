import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Radar,
  BrainCircuit,
  Newspaper,
  Scale,
  CheckCircle2,
  Shield,
  Landmark,
  Activity
} from 'lucide-react';

const EXPERIENCE_PILLARS = [
  {
    icon: Radar,
    title: 'Market Pulse, Without Clutter',
    text: 'Follow movers, watchlists, and key snapshots in a clean view that highlights what needs your attention now.'
  },
  {
    icon: Newspaper,
    title: 'News With Meaning',
    text: 'Understand why a headline matters for your holdings, not just what happened in the market.'
  },
  {
    icon: Scale,
    title: 'Compare Ideas Faster',
    text: 'Evaluate stocks, funds, and broader market context side by side before you decide your next move.'
  },
  {
    icon: BrainCircuit,
    title: 'Ask Better Questions',
    text: 'Use AI chat to explore scenarios, clarify terms, and turn uncertainty into a practical action plan.'
  }
];

const INVESTOR_FLOW = [
  {
    step: '01',
    title: 'Start From Intent',
    text: 'Type what you want to evaluate, from a stock idea to a portfolio concern, and Arth frames the research path.'
  },
  {
    step: '02',
    title: 'Review Context Quickly',
    text: 'See price action, relevant headlines, and practical explanations in one place instead of switching between tools.'
  },
  {
    step: '03',
    title: 'Act With Confidence',
    text: 'Save to watchlist, adjust your portfolio, or continue asking questions until your decision feels grounded.'
  }
];

const DAILY_RHYTHM = [
  {
    icon: Activity,
    title: 'Morning Snapshot',
    text: 'Get a focused read on market direction, standout movements, and watchlist momentum.'
  },
  {
    icon: Landmark,
    title: 'Midday Clarity',
    text: 'Track portfolio impact as narratives shift and see what changed in plain language.'
  },
  {
    icon: Shield,
    title: 'Disciplined Decisions',
    text: 'Use guided prompts and structured views to reduce impulsive choices and improve consistency.'
  }
];

const PROMISES = [
  'Simple language for complex market moves',
  'One workspace for research, tracking, and decisions',
  'Built to support beginners and growing investors alike'
];

const PRODUCT_AREAS = ['Stocks', 'Mutual Funds', 'Portfolio', 'Watchlist', 'Market News', 'AI Chat'];

export default function Landing() {
  return (
    <div className="landing-page landing-v3">
      <div className="landing-atmosphere" />
      <div className="landing-orb landing-orb-a" />
      <div className="landing-orb landing-orb-b" />

      <header className="landing-nav">
        <div className="landing-brand">
          <div className="arth-logo-mark" aria-hidden="true">A</div>
          <div>
            <div className="landing-brand-title">Arth</div>
            <div className="landing-brand-subtitle">Intelligent Financial Co-pilot</div>
          </div>
        </div>

        <div className="landing-nav-actions">
          <Link to="/login" className="btn btn-ghost">Sign in</Link>
          <Link to="/register" className="btn btn-primary">Get Started <ArrowRight size={14} /></Link>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero landing-hero-v3">
          <div className="landing-kicker">Arth for Indian Retail Investors</div>
          <h1>
            Make market decisions with <span>clarity, context, and confidence.</span>
          </h1>
          <p className="landing-hero-lead">
            Arth brings live market movement, contextual news, portfolio tracking, and guided AI conversations
            into one focused workspace so you can move from information to action faster.
          </p>

          <div className="landing-cta-row">
            <Link to="/register" className="btn btn-primary">Create Free Account</Link>
            <Link to="/login" className="btn btn-ghost">Open Dashboard <ArrowRight size={14} /></Link>
          </div>

          <div className="landing-chip-row">
            {PRODUCT_AREAS.map((area) => (
              <span key={area} className="landing-chip">{area}</span>
            ))}
          </div>
        </section>

        <section className="landing-cards landing-feature-grid">
          {EXPERIENCE_PILLARS.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="landing-card">
                <div className="icon-wrap"><Icon size={16} /></div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            );
          })}
        </section>

        <section className="landing-story-grid">
          <article className="landing-story-card">
            <div className="stack-title">
              <Radar size={16} />
              How Arth Supports Your Workflow
            </div>
            <div className="landing-step-list">
              {INVESTOR_FLOW.map((item) => {
                return (
                  <div key={item.step} className="landing-step-row">
                    <div className="landing-step-index">{item.step}</div>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="landing-story-card landing-story-card-alt">
            <div className="stack-title">
              <Shield size={16} />
              Why Investors Choose Arth
            </div>
            <p className="stack-note">
              The experience is designed to stay calm and practical even on volatile market days.
            </p>

            <div className="landing-rhythm-list">
              {DAILY_RHYTHM.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="landing-rhythm-row">
                    <div className="stack-row-icon"><Icon size={14} /></div>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="landing-promise-list">
              {PROMISES.map((item) => (
                <div key={item} className="stack-footer">
                  <CheckCircle2 size={14} />
                  {item}
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="landing-final-cta">
          <div>
            <h3>Build your investing routine with Arth.</h3>
            <p>Join free and start making clearer decisions with one connected market workspace.</p>
          </div>
          <Link to="/register" className="btn btn-primary">Start Free <ArrowRight size={14} /></Link>
        </section>
      </main>
    </div>
  );
}