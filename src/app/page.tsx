'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';

const SUIT_SYMBOLS = ['\u2660', '\u2665', '\u2666', '\u2663'];

function FloatingSuits() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const suits: HTMLSpanElement[] = [];
    for (let i = 0; i < 20; i++) {
      const el = document.createElement('span');
      el.className = 'floating-suit';
      el.textContent = SUIT_SYMBOLS[i % 4];
      el.style.color = i % 4 === 1 || i % 4 === 2 ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.08)';
      el.style.fontSize = `${1.2 + Math.random() * 1.8}rem`;
      container.appendChild(el);
      suits.push(el);
    }

    suits.forEach((el, i) => {
      const startX = Math.random() * 100;
      const duration = 12 + Math.random() * 16;
      gsap.set(el, { x: `${startX}vw`, y: '110vh', opacity: 0 });
      gsap.to(el, {
        y: '-10vh',
        x: `+=${(Math.random() - 0.5) * 200}`,
        rotation: (Math.random() - 0.5) * 360,
        opacity: 0.15,
        duration,
        delay: i * 1.2,
        repeat: -1,
        ease: 'none',
      });
    });

    return () => {
      suits.forEach(el => el.remove());
    };
  }, []);

  return <div ref={containerRef} className="floating-suits" />;
}

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [showLog, setShowLog] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/auth')
      .then(r => r.json())
      .then(data => {
        if (data.name) {
          setSavedName(data.name);
          setName(data.name);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Entrance animation
  useEffect(() => {
    if (loading) return;
    const tl = gsap.timeline();

    tl.fromTo(panelRef.current,
      { y: 40, opacity: 0, scale: 0.95 },
      { y: 0, opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(1.4)' }
    );

    if (titleRef.current) {
      tl.fromTo(titleRef.current,
        { y: -20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out' },
        '-=0.3'
      );
      // Title shimmer
      gsap.to(titleRef.current, {
        backgroundPosition: '-200% 0',
        duration: 3,
        repeat: -1,
        ease: 'linear',
      });
    }

    if (contentRef.current) {
      const children = contentRef.current.children;
      tl.fromTo(children,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4, stagger: 0.08, ease: 'power2.out' },
        '-=0.2'
      );
    }
  }, [loading, savedName]);

  async function saveName() {
    if (!name.trim()) return;
    setError('');
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      setSavedName(data.name);
    } else {
      setError(data.error);
    }
  }

  async function createGame() {
    setError('');
    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxPlayers: 6, showLog }),
    });
    const data = await res.json();
    if (res.ok) {
      router.push(`/game/${data.code}`);
    } else {
      setError(data.error);
    }
  }

  async function joinGame() {
    if (!joinCode.trim()) return;
    setError('');
    const code = joinCode.trim().toUpperCase();
    const res = await fetch(`/api/games/${code}/join`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      router.push(`/game/${code}`);
    } else {
      setError(data.error);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-emerald-200 animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <FloatingSuits />

      <div ref={panelRef} className="glass-panel rounded-2xl p-8 max-w-md w-full relative z-10" style={{ opacity: 0 }}>
        <h1 ref={titleRef} className="text-5xl font-bold text-center mb-2 title-shimmer tracking-tight" style={{ opacity: 0 }}>
          Literature
        </h1>
        <p className="text-center text-emerald-300/70 mb-8 text-sm tracking-wide">
          The classic team card game
        </p>

        {error && (
          <div className="bg-red-900/40 border border-red-500/50 text-red-200 px-4 py-2 rounded-lg mb-4 text-sm backdrop-blur-sm">
            {error}
          </div>
        )}

        <div ref={contentRef}>
          {!savedName ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-emerald-300/80 mb-1.5 font-medium">
                  Enter your name to get started
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveName()}
                  placeholder="Your name"
                  maxLength={20}
                  autoFocus
                  className="w-full px-4 py-3 bg-black/30 border border-emerald-600/40 rounded-xl text-white placeholder-emerald-700 focus:outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/30 transition-all"
                />
              </div>
              <button
                onClick={saveName}
                className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl transition-all btn-glow hover:shadow-lg hover:shadow-amber-600/20"
              >
                Continue
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <span className="text-emerald-400/60 text-xs uppercase tracking-widest">Playing as</span>
                <div className="text-xl font-semibold text-white mt-0.5">{savedName}</div>
                <button
                  onClick={() => setSavedName(null)}
                  className="text-xs text-emerald-500 hover:text-emerald-300 mt-1 transition-colors"
                >
                  Change name
                </button>
              </div>

              <div className="flex items-center justify-between px-1 mb-5">
                <label className="text-sm text-emerald-300/80 font-medium">Game Log</label>
                <button
                  onClick={() => setShowLog(!showLog)}
                  className={`relative w-12 h-6 rounded-full transition-all ${showLog ? 'bg-amber-600 shadow-md shadow-amber-600/30' : 'bg-black/30 border border-emerald-700/30'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${showLog ? 'translate-x-6' : ''}`} />
                </button>
              </div>
              {!showLog && (
                <div className="text-xs text-emerald-600 text-center mb-4 -mt-3">
                  Game log will be hidden for all players
                </div>
              )}

              <button
                onClick={createGame}
                className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl transition-all text-lg btn-glow hover:shadow-lg hover:shadow-amber-600/25 active:scale-[0.98]"
              >
                Create New Game
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-emerald-700/40" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-transparent text-emerald-500/60 text-xs uppercase tracking-wider">
                    or join a game
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && joinGame()}
                  placeholder="Game code"
                  maxLength={6}
                  className="flex-1 px-4 py-3 bg-black/30 border border-emerald-600/40 rounded-xl text-white placeholder-emerald-700 focus:outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/30 uppercase tracking-[0.2em] text-center font-mono transition-all"
                />
                <button
                  onClick={joinGame}
                  className="px-6 py-3 bg-emerald-700/70 hover:bg-emerald-600/80 text-white font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-emerald-600/15 active:scale-[0.98]"
                >
                  Join
                </button>
              </div>

              <div className="mt-8 pt-6 border-t border-emerald-800/40">
                <h3 className="text-amber-300/80 font-semibold mb-2 text-sm">How to Play</h3>
                <ul className="text-emerald-400/60 text-xs space-y-1.5 list-disc list-inside leading-relaxed">
                  <li>6 players, each playing individually</li>
                  <li>48 cards (no 7s), 8 half-suits of 6 cards each</li>
                  <li>Ask any other player for specific cards you need</li>
                  <li>Claim half-suits by declaring who holds each card</li>
                  <li>Player with the most claimed sets wins!</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
