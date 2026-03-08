'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [playerCount, setPlayerCount] = useState<4 | 6>(6);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      body: JSON.stringify({ maxPlayers: playerCount }),
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
        <div className="text-xl text-emerald-200">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-emerald-900/80 rounded-2xl shadow-2xl p-8 max-w-md w-full border border-emerald-700/50">
        <h1 className="text-4xl font-bold text-center mb-2 text-amber-300">
          Literature
        </h1>
        <p className="text-center text-emerald-300 mb-8 text-sm">
          The classic team card game
        </p>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {!savedName ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-emerald-300 mb-1">
                Enter your name to get started
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveName()}
                placeholder="Your name"
                maxLength={20}
                className="w-full px-4 py-3 bg-emerald-950 border border-emerald-600 rounded-lg text-white placeholder-emerald-700 focus:outline-none focus:border-amber-400"
              />
            </div>
            <button
              onClick={saveName}
              className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg transition-colors"
            >
              Continue
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <span className="text-emerald-400 text-sm">Playing as</span>
              <div className="text-xl font-semibold text-white">{savedName}</div>
              <button
                onClick={() => setSavedName(null)}
                className="text-xs text-emerald-500 hover:text-emerald-300 mt-1"
              >
                Change name
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-sm text-emerald-300">Number of players</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setPlayerCount(4)}
                  className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                    playerCount === 4
                      ? 'bg-amber-600 text-white'
                      : 'bg-emerald-800 text-emerald-300 hover:bg-emerald-700'
                  }`}
                >
                  4 Players
                </button>
                <button
                  onClick={() => setPlayerCount(6)}
                  className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                    playerCount === 6
                      ? 'bg-amber-600 text-white'
                      : 'bg-emerald-800 text-emerald-300 hover:bg-emerald-700'
                  }`}
                >
                  6 Players
                </button>
              </div>
              <div className="text-xs text-emerald-500 text-center">
                {playerCount === 4 ? '2 teams of 2 · 12 cards each' : '2 teams of 3 · 8 cards each'}
              </div>
            </div>

            <button
              onClick={createGame}
              className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg transition-colors text-lg"
            >
              Create New Game
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-emerald-700" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-emerald-900/80 text-emerald-500">
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
                className="flex-1 px-4 py-3 bg-emerald-950 border border-emerald-600 rounded-lg text-white placeholder-emerald-700 focus:outline-none focus:border-amber-400 uppercase tracking-widest text-center font-mono"
              />
              <button
                onClick={joinGame}
                className="px-6 py-3 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-lg transition-colors"
              >
                Join
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-emerald-800">
              <h3 className="text-amber-300 font-semibold mb-2 text-sm">How to Play</h3>
              <ul className="text-emerald-400 text-xs space-y-1 list-disc list-inside">
                <li>4 or 6 players split into 2 equal teams</li>
                <li>48 cards (no 8s), 8 half-suits of 6 cards each</li>
                <li>Ask opponents for specific cards you need</li>
                <li>Claim half-suits by declaring who holds each card</li>
                <li>Team with more claimed sets wins!</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
