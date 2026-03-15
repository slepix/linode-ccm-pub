import React, { useState } from 'react';
import {
  Shield, Key, ArrowRight, ArrowLeft, Check, Loader2,
  ExternalLink, Eye, EyeOff, Server, CheckCircle, AlertCircle,
  Zap, Lock, Globe,
} from 'lucide-react';
import { accountsApi } from '../api/accounts';

interface Props {
  onComplete: () => void;
}

type Step = 'welcome' | 'token' | 'name' | 'connecting' | 'done';

const LINODE_TOKEN_URL = 'https://cloud.linode.com/profile/tokens';

export default function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [accountName, setAccountName] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState('');
  const [tokenFocused, setTokenFocused] = useState(false);

  const handleConnect = async () => {
    if (!accountName.trim() || !apiToken.trim()) return;
    setStep('connecting');
    setError('');
    try {
      await accountsApi.create({ name: accountName.trim(), api_token: apiToken.trim() });
      setStep('done');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to connect account');
      setStep('name');
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6 min-h-0">
      <div className="w-full max-w-2xl">
        <StepIndicator current={step} />

        <div className="mt-8">
          {step === 'welcome' && <WelcomeStep onNext={() => setStep('token')} />}
          {step === 'token' && (
            <TokenStep
              onNext={() => setStep('name')}
              onBack={() => setStep('welcome')}
              apiToken={apiToken}
              setApiToken={setApiToken}
              showToken={showToken}
              setShowToken={setShowToken}
              focused={tokenFocused}
              setFocused={setTokenFocused}
            />
          )}
          {step === 'name' && (
            <NameStep
              onNext={handleConnect}
              onBack={() => setStep('token')}
              accountName={accountName}
              setAccountName={setAccountName}
              apiToken={apiToken}
              error={error}
            />
          )}
          {step === 'connecting' && <ConnectingStep />}
          {step === 'done' && <DoneStep onComplete={onComplete} accountName={accountName} />}
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'welcome', label: 'Welcome' },
    { id: 'token', label: 'API Token' },
    { id: 'name', label: 'Account' },
    { id: 'done', label: 'Complete' },
  ];

  const order: Step[] = ['welcome', 'token', 'name', 'connecting', 'done'];
  const currentIndex = order.indexOf(current);

  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((s, i) => {
        const stepIndex = order.indexOf(s.id);
        const isDone = currentIndex > stepIndex;
        const isActive = current === s.id || (current === 'connecting' && s.id === 'name');

        return (
          <React.Fragment key={s.id}>
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                isDone
                  ? 'bg-lncyan2 text-white'
                  : isActive
                  ? 'bg-lncyan2/20 border-2 border-lncyan2 text-lncyan2'
                  : 'bg-lnborder/40 border border-lnborder text-lnfaint'
              }`}>
                {isDone ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`text-[10px] font-medium uppercase tracking-wider transition-colors ${
                isActive ? 'text-lncyan2' : isDone ? 'text-lnmuted' : 'text-lnfaint'
              }`}>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-16 h-px mb-5 transition-colors duration-300 ${
                currentIndex > stepIndex ? 'bg-lncyan2' : 'bg-lnborder'
              }`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="bg-lndark border border-lnborder rounded-xl overflow-hidden">
      <div className="relative px-10 py-12 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-lncyan2/5 via-transparent to-transparent pointer-events-none" />
        <div className="relative">
          <div className="w-20 h-20 bg-lncyan2/10 border border-lncyan2/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Shield className="w-10 h-10 text-lncyan2" />
          </div>
          <h1 className="text-2xl font-bold text-lntext mb-3">Welcome to Akamai CCM</h1>
          <p className="text-lnmuted text-sm leading-relaxed max-w-md mx-auto mb-8">
            Cloud Compliance Manager monitors your Linode infrastructure against security best practices
            and compliance rules. Connect your first account to get started.
          </p>

          <div className="grid grid-cols-3 gap-4 mb-10 text-left">
            {[
              { icon: Server, title: 'Resource Discovery', desc: 'Automatically scans all your Linode resources' },
              { icon: Lock, title: 'Security Checks', desc: 'Evaluates against 50+ compliance rules' },
              { icon: Zap, title: 'Real-time Insights', desc: 'Compliance scores and detailed reports' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-lnbg border border-lnborder rounded-lg p-4">
                <div className="w-8 h-8 bg-lncyan2/10 rounded-lg flex items-center justify-center mb-3">
                  <Icon className="w-4 h-4 text-lncyan2" />
                </div>
                <div className="text-xs font-semibold text-lntext mb-1">{title}</div>
                <div className="text-xs text-lnfaint leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>

          <button
            onClick={onNext}
            className="inline-flex items-center gap-2.5 bg-lncyan2 hover:bg-lncyan text-white px-8 py-3 rounded-lg text-sm font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-lncyan2/20 active:scale-95"
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TokenStep({
  onNext, onBack, apiToken, setApiToken, showToken, setShowToken, focused, setFocused,
}: {
  onNext: () => void;
  onBack: () => void;
  apiToken: string;
  setApiToken: (v: string) => void;
  showToken: boolean;
  setShowToken: (v: boolean) => void;
  focused: boolean;
  setFocused: (v: boolean) => void;
}) {
  const isValid = apiToken.trim().length > 10;

  return (
    <div className="bg-lndark border border-lnborder rounded-xl overflow-hidden">
      <div className="px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-lncyan2/10 border border-lncyan2/20 rounded-lg flex items-center justify-center">
            <Key className="w-5 h-5 text-lncyan2" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-lntext">Create an API Token</h2>
            <p className="text-xs text-lnmuted">Generate a Personal Access Token from Linode Cloud Manager</p>
          </div>
        </div>

        <div className="bg-lnbg border border-lnborder rounded-lg p-5 mb-6">
          <h3 className="text-xs font-bold text-lnmuted uppercase tracking-wider mb-4">How to create your token</h3>
          <div className="space-y-3">
            {[
              { step: '1', text: 'Log in to Linode Cloud Manager' },
              { step: '2', text: 'Navigate to your Profile → API Tokens' },
              { step: '3', text: 'Click "Create a Personal Access Token"' },
              { step: '4', text: 'Set a label, expiry, and select Read-Only scopes for all resources' },
              { step: '5', text: 'Copy the generated token and paste it below' },
            ].map(({ step, text }) => (
              <div key={step} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-lncyan2/15 border border-lncyan2/30 text-lncyan2 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {step}
                </div>
                <span className="text-sm text-lnmuted">{text}</span>
              </div>
            ))}
          </div>
          <a
            href={LINODE_TOKEN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs text-lncyan2 hover:text-lncyan font-medium transition-colors"
          >
            Open Linode API Tokens
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="mb-6">
          <label className="block text-xs font-semibold text-lnmuted uppercase tracking-wider mb-2">
            Personal Access Token
          </label>
          <div className={`relative flex items-center rounded-lg border transition-all duration-200 ${
            focused ? 'border-lncyan2 shadow-sm shadow-lncyan2/10' : 'border-lnborder'
          } bg-lnbg`}>
            <input
              type={showToken ? 'text' : 'password'}
              value={apiToken}
              onChange={e => setApiToken(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Paste your Linode API token here"
              className="flex-1 bg-transparent px-4 py-3 text-sm text-lntext placeholder-lnfaint font-mono focus:outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowToken(v => !v)}
              className="px-3 text-lnfaint hover:text-lnmuted transition-colors"
              tabIndex={-1}
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="mt-2 text-xs text-lnfaint">
            Your token is encrypted at rest and never exposed after saving.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm text-lnmuted hover:text-lntext transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={onNext}
            disabled={!isValid}
            className="inline-flex items-center gap-2 bg-lncyan2 hover:bg-lncyan disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-lncyan2/20 active:scale-95"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function NameStep({
  onNext, onBack, accountName, setAccountName, apiToken, error,
}: {
  onNext: () => void;
  onBack: () => void;
  accountName: string;
  setAccountName: (v: string) => void;
  apiToken: string;
  error: string;
}) {
  const [focused, setFocused] = useState(false);
  const isValid = accountName.trim().length > 0 && apiToken.trim().length > 0;

  const suggestions = ['Production', 'Staging', 'Development', 'My Linode'];

  return (
    <div className="bg-lndark border border-lnborder rounded-xl overflow-hidden">
      <div className="px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-lncyan2/10 border border-lncyan2/20 rounded-lg flex items-center justify-center">
            <Globe className="w-5 h-5 text-lncyan2" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-lntext">Name Your Account</h2>
            <p className="text-xs text-lnmuted">Give this account a recognisable name</p>
          </div>
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-2.5 px-4 py-3 rounded-lg bg-lnred/10 border border-lnred/30 text-lnred text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mb-5">
          <label className="block text-xs font-semibold text-lnmuted uppercase tracking-wider mb-2">
            Account Name
          </label>
          <div className={`rounded-lg border transition-all duration-200 ${
            focused ? 'border-lncyan2 shadow-sm shadow-lncyan2/10' : 'border-lnborder'
          } bg-lnbg`}>
            <input
              type="text"
              value={accountName}
              onChange={e => setAccountName(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={e => e.key === 'Enter' && isValid && onNext()}
              placeholder="e.g. Production"
              className="w-full bg-transparent px-4 py-3 text-sm text-lntext placeholder-lnfaint focus:outline-none rounded-lg"
              autoFocus
            />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => setAccountName(s)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all duration-150 ${
                  accountName === s
                    ? 'border-lncyan2 bg-lncyan2/10 text-lncyan2'
                    : 'border-lnborder text-lnfaint hover:border-lnmuted hover:text-lnmuted'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-lnbg border border-lnborder rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-xs text-lnmuted mb-2">
            <Key className="w-3.5 h-3.5 text-lncyan2" />
            <span className="font-medium">Token preview</span>
          </div>
          <div className="font-mono text-xs text-lnfaint truncate">
            {apiToken.slice(0, 8)}{'•'.repeat(Math.max(0, apiToken.length - 12))}{apiToken.slice(-4)}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm text-lnmuted hover:text-lntext transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={onNext}
            disabled={!isValid}
            className="inline-flex items-center gap-2 bg-lncyan2 hover:bg-lncyan disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-lncyan2/20 active:scale-95"
          >
            Connect Account
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ConnectingStep() {
  return (
    <div className="bg-lndark border border-lnborder rounded-xl px-8 py-16 text-center">
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 bg-lncyan2/10 rounded-2xl" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-lncyan2 animate-spin" />
        </div>
        <div className="absolute -inset-2 border-2 border-lncyan2/20 rounded-2xl animate-pulse" />
      </div>
      <h2 className="text-lg font-bold text-lntext mb-2">Connecting your account…</h2>
      <p className="text-sm text-lnmuted">Verifying your API token and saving your account.</p>
    </div>
  );
}

function DoneStep({ onComplete, accountName }: { onComplete: () => void; accountName: string }) {
  return (
    <div className="bg-lndark border border-lnborder rounded-xl overflow-hidden">
      <div className="relative px-8 py-12 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-lngreen/5 via-transparent to-transparent pointer-events-none" />
        <div className="relative">
          <div className="w-20 h-20 bg-lngreen/10 border border-lngreen/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-lngreen" />
          </div>
          <h2 className="text-2xl font-bold text-lntext mb-2">Account Connected!</h2>
          <p className="text-lnmuted text-sm mb-1">
            <span className="text-lntext font-medium">{accountName}</span> has been successfully added.
          </p>
          <p className="text-lnmuted text-sm mb-8">
            You can now sync your resources and start monitoring compliance.
          </p>

          <div className="grid grid-cols-3 gap-3 mb-8 text-left">
            {[
              { title: 'Sync Resources', desc: 'Click "Sync & Evaluate" on the dashboard to discover all your Linode resources.' },
              { title: 'Review Compliance', desc: 'Check your compliance score and see which rules need attention.' },
              { title: 'Add More Accounts', desc: 'Connect additional Linode accounts via the Accounts settings page.' },
            ].map(({ title, desc }) => (
              <div key={title} className="bg-lnbg border border-lnborder rounded-lg p-4">
                <div className="text-xs font-semibold text-lntext mb-1">{title}</div>
                <div className="text-xs text-lnfaint leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>

          <button
            onClick={onComplete}
            className="inline-flex items-center gap-2.5 bg-lncyan2 hover:bg-lncyan text-white px-8 py-3 rounded-lg text-sm font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-lncyan2/20 active:scale-95"
          >
            Go to Dashboard
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
