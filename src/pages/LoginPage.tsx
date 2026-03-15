import React, { useState, useEffect, useRef } from 'react';
import { Shield, Eye, EyeOff, Loader2, ShieldCheck, ChevronLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api/auth';

type Stage = 'credentials' | 'totp';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [stage, setStage] = useState<Stage>('credentials');
  const [regOpen, setRegOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const totpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    authApi.registrationOpen().then(({ open }) => {
      setRegOpen(open);
      if (open) setMode('register');
    });
  }, []);

  useEffect(() => {
    if (stage === 'totp') {
      setTimeout(() => totpRef.current?.focus(), 50);
    }
  }, [stage]);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const result = await login(email, password);
        if (result.requiresTotp) {
          setStage('totp');
          setTotpCode('');
        }
      } else {
        await register(email, password, fullName);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length !== 6) return;
    setError('');
    setLoading(true);
    try {
      await login(email, password, totpCode);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid code. Please try again.');
      setTotpCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleTotpInput = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setTotpCode(digits);
    setError('');
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
          {stage === 'credentials' ? (
            <>
              <h2 className="text-base font-semibold text-lntext mb-5">
                {mode === 'login' ? 'Log in to your account' : 'Create admin account'}
              </h2>

              {error && (
                <div className="mb-4 px-3 py-2.5 rounded bg-lnred/10 border border-lnred/40 text-lnred text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleCredentials} className="space-y-4">
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
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded bg-lncyan2/10 border border-lncyan2/20 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-lncyan2" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-lntext">Two-Factor Verification</h2>
                  <p className="text-xs text-lnmuted mt-0.5">Enter the code from your authenticator app</p>
                </div>
              </div>

              {error && (
                <div className="mb-4 px-3 py-2.5 rounded bg-lnred/10 border border-lnred/40 text-lnred text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleTotp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-lnmuted mb-1.5 uppercase tracking-wide">Authenticator Code</label>
                  <input
                    ref={totpRef}
                    type="text"
                    inputMode="numeric"
                    value={totpCode}
                    onChange={e => handleTotpInput(e.target.value)}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full bg-lnbg border border-lnborder rounded px-3 py-3 text-center text-2xl font-mono tracking-[0.5em] text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2 transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || totpCode.length !== 6}
                  className="w-full bg-lncyan2 hover:bg-lncyan disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded py-2.5 text-sm transition flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Verify & Log In
                </button>
              </form>

              <button
                onClick={() => { setStage('credentials'); setError(''); setTotpCode(''); }}
                className="flex items-center gap-1.5 text-sm text-lnfaint hover:text-lnmuted transition mt-4 mx-auto"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
