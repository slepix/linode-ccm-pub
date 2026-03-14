import React, { useState, useEffect } from 'react';
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api/auth';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [regOpen, setRegOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    authApi.registrationOpen().then(({ open }) => {
      setRegOpen(open);
      if (open) setMode('register');
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, fullName);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-lnbg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded bg-lncyan2 mb-5">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-lntext tracking-tight">Akamai CCM</h1>
          <p className="text-lnmuted mt-1.5 text-sm">Cloud Compliance Manager for Linode</p>
        </div>

        <div className="bg-lndark border border-lnborder rounded p-7">
          <h2 className="text-base font-semibold text-lntext mb-5">
            {mode === 'login' ? 'Log in to your account' : 'Create admin account'}
          </h2>

          {error && (
            <div className="mb-4 px-3 py-2.5 rounded bg-lnred/10 border border-lnred/40 text-lnred text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-lnmuted mb-1.5 uppercase tracking-wide">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full bg-lnbg border border-lnborder rounded px-3 py-2 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2 transition"
                  placeholder="Your name"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-lnmuted mb-1.5 uppercase tracking-wide">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-lnbg border border-lnborder rounded px-3 py-2 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2 transition"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-lnmuted mb-1.5 uppercase tracking-wide">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full bg-lnbg border border-lnborder rounded px-3 py-2 pr-10 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2 transition"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-lnfaint hover:text-lnmuted transition"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-lncyan2 hover:bg-lncyan disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded py-2.5 text-sm transition flex items-center justify-center gap-2 mt-1"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? 'Log In' : 'Create Account'}
            </button>
          </form>

          {regOpen && mode === 'login' && (
            <p className="text-center text-sm text-lnfaint mt-4">
              No accounts yet.{' '}
              <button onClick={() => setMode('register')} className="text-lncyan2 hover:text-lncyan transition">
                Create the first admin account
              </button>
            </p>
          )}
          {mode === 'register' && !regOpen && (
            <p className="text-center text-sm text-lnfaint mt-4">
              <button onClick={() => setMode('login')} className="text-lncyan2 hover:text-lncyan transition">
                Back to sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
