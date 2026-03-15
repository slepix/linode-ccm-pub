import React, { useState, useEffect, useRef } from 'react';
import { X, ShieldCheck, ShieldOff, Copy, Check, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import { authApi } from '../api/auth';

type Step = 'loading' | 'status' | 'scan' | 'verify' | 'disable' | 'success_enable' | 'success_disable';

interface Props {
  onClose: () => void;
}

export default function TwoFactorSetupModal({ onClose }: Props) {
  const [step, setStep] = useState<Step>('loading');
  const [is2faEnabled, setIs2faEnabled] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    authApi.get2faStatus().then(({ enabled }) => {
      setIs2faEnabled(enabled);
      setStep('status');
    }).catch(() => setStep('status'));
  }, []);

  useEffect(() => {
    if (step === 'verify' || step === 'disable') {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [step]);

  const handleStartSetup = async () => {
    setSaving(true);
    setError('');
    try {
      const data = await authApi.setup2fa();
      setQrCode(data.qr_code);
      setSecret(data.secret);
      setStep('scan');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start setup');
    } finally {
      setSaving(false);
    }
  };

  const handleEnable = async () => {
    if (code.length !== 6) return;
    setSaving(true);
    setError('');
    try {
      await authApi.enable2fa(code);
      setStep('success_enable');
      setTimeout(onClose, 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to enable 2FA');
      setCode('');
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    if (code.length !== 6) return;
    setSaving(true);
    setError('');
    try {
      await authApi.disable2fa(code);
      setStep('success_disable');
      setTimeout(onClose, 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to disable 2FA');
      setCode('');
    } finally {
      setSaving(false);
    }
  };

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCodeInput = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-lndark border border-lncard rounded-lg w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-lncard">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded flex items-center justify-center ${is2faEnabled ? 'bg-lngreen/10 border border-lngreen/20' : 'bg-lncyan2/10 border border-lncyan2/20'}`}>
              <ShieldCheck className={`w-4 h-4 ${is2faEnabled ? 'text-lngreen' : 'text-lncyan2'}`} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-lntext">Two-Factor Authentication</h2>
              <p className="text-xs text-lnmuted mt-0.5">Authenticator app (TOTP)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-lnmuted hover:text-lntext transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5">
          {step === 'loading' && (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="w-5 h-5 text-lncyan animate-spin" />
            </div>
          )}

          {step === 'status' && (
            <div className="space-y-4">
              <div className={`flex items-start gap-3 px-4 py-3.5 rounded border ${
                is2faEnabled
                  ? 'bg-lngreen/5 border-lngreen/25'
                  : 'bg-lnamber/5 border-lnamber/25'
              }`}>
                <ShieldCheck className={`w-5 h-5 mt-0.5 shrink-0 ${is2faEnabled ? 'text-lngreen' : 'text-lnamber'}`} />
                <div>
                  <p className={`text-sm font-medium ${is2faEnabled ? 'text-lngreen' : 'text-lnamber'}`}>
                    {is2faEnabled ? '2FA is enabled' : '2FA is not enabled'}
                  </p>
                  <p className="text-xs text-lnmuted mt-1">
                    {is2faEnabled
                      ? 'Your account requires an authenticator code every time you log in.'
                      : 'Enable two-factor authentication to add an extra layer of security to your account.'}
                  </p>
                </div>
              </div>

              {!is2faEnabled && (
                <div className="space-y-2 text-xs text-lnmuted">
                  <p className="font-medium text-lntext text-sm">How it works</p>
                  <ol className="space-y-1.5 list-none">
                    <li className="flex items-start gap-2"><span className="w-4 h-4 rounded-full bg-lncyan2/20 text-lncyan2 flex items-center justify-center shrink-0 font-semibold text-[10px]">1</span>Install an authenticator app (Google Authenticator, Authy, 1Password)</li>
                    <li className="flex items-start gap-2"><span className="w-4 h-4 rounded-full bg-lncyan2/20 text-lncyan2 flex items-center justify-center shrink-0 font-semibold text-[10px]">2</span>Scan the QR code shown in the next step</li>
                    <li className="flex items-start gap-2"><span className="w-4 h-4 rounded-full bg-lncyan2/20 text-lncyan2 flex items-center justify-center shrink-0 font-semibold text-[10px]">3</span>Enter the 6-digit code from your app to confirm</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {step === 'scan' && (
            <div className="space-y-4">
              <p className="text-sm text-lnmuted">Scan this QR code with your authenticator app, then click Continue.</p>
              <div className="flex justify-center">
                <div className="p-3 bg-white rounded-lg">
                  <img src={qrCode} alt="TOTP QR Code" className="w-48 h-48" />
                </div>
              </div>
              <div>
                <p className="text-xs text-lnmuted mb-1.5">Or enter this key manually:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-lnbg border border-lnborder rounded text-xs font-mono text-lncyan2 tracking-widest select-all">
                    {secret}
                  </code>
                  <button
                    onClick={handleCopySecret}
                    className="p-2 text-lnmuted hover:text-lntext bg-lncard hover:bg-lnborder rounded transition-colors"
                    title="Copy secret"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-lngreen" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'verify' && (
            <div className="space-y-4">
              <p className="text-sm text-lnmuted">Enter the 6-digit code from your authenticator app to confirm setup.</p>
              <div>
                <label className="block text-xs font-medium text-lnmuted mb-1.5">Verification Code</label>
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={e => handleCodeInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && code.length === 6 && handleEnable()}
                  placeholder="000000"
                  className="w-full bg-lncard border border-lnborder rounded px-3 py-2.5 text-center text-xl font-mono tracking-[0.4em] text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2 transition-colors"
                  maxLength={6}
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded bg-lnred/10 border border-lnred/30 text-lnred text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
                </div>
              )}
            </div>
          )}

          {step === 'disable' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded bg-lnamber/10 border border-lnamber/30 text-lnamber text-xs">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Disabling 2FA will reduce your account's security. Enter your current authenticator code to confirm.
              </div>
              <div>
                <label className="block text-xs font-medium text-lnmuted mb-1.5">Current Authenticator Code</label>
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={e => handleCodeInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && code.length === 6 && handleDisable()}
                  placeholder="000000"
                  className="w-full bg-lncard border border-lnborder rounded px-3 py-2.5 text-center text-xl font-mono tracking-[0.4em] text-lntext placeholder-lnfaint focus:outline-none focus:border-lnred transition-colors"
                  maxLength={6}
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded bg-lnred/10 border border-lnred/30 text-lnred text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
                </div>
              )}
            </div>
          )}

          {(step === 'success_enable' || step === 'success_disable') && (
            <div className={`flex items-center gap-2.5 px-4 py-3 rounded border ${
              step === 'success_enable'
                ? 'bg-lngreen/10 border-lngreen/30 text-lngreen'
                : 'bg-lnmuted/10 border-lnborder text-lnmuted'
            } text-sm`}>
              <Check className="w-4 h-4 shrink-0" />
              {step === 'success_enable'
                ? 'Two-factor authentication has been enabled.'
                : 'Two-factor authentication has been disabled.'}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-lncard flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-lnmuted hover:text-lntext bg-lncard hover:bg-lnborder rounded transition"
          >
            {step === 'success_enable' || step === 'success_disable' ? 'Close' : 'Cancel'}
          </button>

          <div className="flex items-center gap-2">
            {step === 'status' && !is2faEnabled && (
              <button
                onClick={handleStartSetup}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-lncyan2 hover:bg-lncyan disabled:opacity-40 text-white text-sm rounded font-medium transition"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                Set Up 2FA
              </button>
            )}
            {step === 'status' && is2faEnabled && (
              <button
                onClick={() => { setCode(''); setError(''); setStep('disable'); }}
                className="flex items-center gap-2 px-4 py-2 bg-lnred/10 hover:bg-lnred/20 border border-lnred/30 text-lnred text-sm rounded font-medium transition"
              >
                <ShieldOff className="w-4 h-4" />
                Disable 2FA
              </button>
            )}
            {step === 'scan' && (
              <button
                onClick={() => { setCode(''); setError(''); setStep('verify'); }}
                className="flex items-center gap-2 px-4 py-2 bg-lncyan2 hover:bg-lncyan text-white text-sm rounded font-medium transition"
              >
                <ChevronRight className="w-4 h-4" />
                Continue
              </button>
            )}
            {step === 'verify' && (
              <button
                onClick={handleEnable}
                disabled={saving || code.length !== 6}
                className="flex items-center gap-2 px-4 py-2 bg-lncyan2 hover:bg-lncyan disabled:opacity-40 text-white text-sm rounded font-medium transition"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Enable 2FA
              </button>
            )}
            {step === 'disable' && (
              <button
                onClick={handleDisable}
                disabled={saving || code.length !== 6}
                className="flex items-center gap-2 px-4 py-2 bg-lnred hover:bg-lnred/80 disabled:opacity-40 text-white text-sm rounded font-medium transition"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
                Disable 2FA
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
