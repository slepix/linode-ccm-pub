import React, { useEffect, useRef } from 'react';
import {
  CheckCircle, XCircle, Loader2, RefreshCw, BarChart3,
  Server, X, ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react';

export type Phase = 'idle' | 'sync' | 'evaluate' | 'done' | 'error';

export interface SyncSummary {
  syncCount?: number;
  evaluated?: number;
  compliant?: number;
  nonCompliant?: number;
  score?: number;
  hasError?: boolean;
}

interface Props {
  phase: Phase;
  logs: string[];
  summary: SyncSummary;
  onDismiss: () => void;
  skipSync?: boolean;
}

const PHASE_LABELS: Record<Phase, string> = {
  idle: 'Starting…',
  sync: 'Syncing resources',
  evaluate: 'Evaluating compliance',
  done: 'Complete',
  error: 'Error',
};

const PHASE_ORDER: Phase[] = ['sync', 'evaluate', 'done'];

function StepIndicator({ label, state }: { label: string; state: 'waiting' | 'active' | 'done' | 'error' }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
        state === 'done' ? 'bg-green-500/20 text-lngreen' :
        state === 'active' ? 'bg-blue-500/20 text-lncyan2' :
        state === 'error' ? 'bg-red-500/20 text-lnred' :
        'bg-lncard text-lnfaint'
      }`}>
        {state === 'done' && <CheckCircle className="w-3.5 h-3.5" />}
        {state === 'active' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {state === 'error' && <XCircle className="w-3.5 h-3.5" />}
        {state === 'waiting' && <div className="w-1.5 h-1.5 rounded-full bg-lnfaint" />}
      </div>
      <span className={`text-sm font-medium transition-colors duration-200 ${
        state === 'done' ? 'text-lngreen' :
        state === 'active' ? 'text-lntext' :
        state === 'error' ? 'text-lnred' :
        'text-lnfaint'
      }`}>
        {label}
      </span>
    </div>
  );
}

export default function SyncProgressPanel({ phase, logs, summary, onDismiss, skipSync }: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  const [logsExpanded, setLogsExpanded] = React.useState(false);

  useEffect(() => {
    if (logRef.current && logsExpanded) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, logsExpanded]);

  const phaseOrderFiltered = skipSync
    ? PHASE_ORDER.filter(p => p !== 'sync')
    : PHASE_ORDER;

  function stepState(step: Phase): 'waiting' | 'active' | 'done' | 'error' {
    if (phase === 'error') {
      const stepIdx = phaseOrderFiltered.indexOf(step);
      const phaseIdx = phaseOrderFiltered.indexOf(phase === 'error' ? 'done' : phase);
      return stepIdx < phaseIdx ? 'done' : stepIdx === phaseIdx ? 'error' : 'waiting';
    }
    const stepIdx = phaseOrderFiltered.indexOf(step);
    const curIdx = phaseOrderFiltered.indexOf(phase);
    if (phase === 'done') return step === 'done' ? 'done' : 'done';
    if (stepIdx < curIdx) return 'done';
    if (stepIdx === curIdx) return 'active';
    return 'waiting';
  }

  const isDone = phase === 'done';
  const isError = phase === 'error';
  const isRunning = !isDone && !isError && phase !== 'idle';

  const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;

  return (
    <div className={`rounded border overflow-hidden transition-all duration-300 ${
      isError ? 'border-lnred/40 bg-lnred/10' :
      isDone ? 'border-lngreen/40 bg-lndark' :
      'border-blue-800/40 bg-lndark'
    }`}>
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${
              isError ? 'bg-red-500/15 text-lnred' :
              isDone ? 'bg-green-500/15 text-lngreen' :
              'bg-blue-500/15 text-lncyan2'
            }`}>
              {isError && <AlertCircle className="w-4 h-4" />}
              {isDone && <CheckCircle className="w-4 h-4" />}
              {!isDone && !isError && <Loader2 className="w-4 h-4 animate-spin" />}
            </div>
            <div>
              <div className={`text-sm font-semibold ${
                isError ? 'text-lnred' : isDone ? 'text-lngreen' : 'text-lntext'
              }`}>
                {isDone ? 'Sync & Evaluation Complete' : isError ? 'Sync Failed' : PHASE_LABELS[phase]}
              </div>
              {!isDone && !isError && lastLog && (
                <div className="text-xs text-lnfaint mt-0.5 max-w-sm truncate">{lastLog}</div>
              )}
            </div>
          </div>

          {isDone && (
            <button
              onClick={onDismiss}
              className="text-lnfaint hover:text-lnmuted transition-colors shrink-0 mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="mt-4 flex items-center gap-6">
          {phaseOrderFiltered.filter(p => p !== 'done').map((step) => (
            <StepIndicator
              key={step}
              label={step === 'sync' ? 'Sync Resources' : 'Evaluate Rules'}
              state={stepState(step)}
            />
          ))}
          <div className="ml-auto">
            <StepIndicator label="Complete" state={isDone ? 'done' : isError ? 'error' : 'waiting'} />
          </div>
        </div>

        {isRunning && (
          <div className="mt-3">
            <div className="h-0.5 bg-lncard rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-700"
                style={{
                  width: phase === 'sync' ? '35%' : phase === 'evaluate' ? '70%' : '100%',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {isDone && !isError && (
        <div className="border-t border-lncard px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {!skipSync && summary.syncCount !== undefined && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded bg-blue-500/10 flex items-center justify-center text-lncyan2">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs text-lnfaint">Resources</div>
                <div className="text-sm font-semibold text-lntext">{summary.syncCount}</div>
              </div>
            </div>
          )}
          {summary.evaluated !== undefined && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded bg-lnborder/50 flex items-center justify-center text-lnmuted">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs text-lnfaint">Checks</div>
                <div className="text-sm font-semibold text-lntext">{summary.evaluated}</div>
              </div>
            </div>
          )}
          {summary.compliant !== undefined && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded bg-green-500/10 flex items-center justify-center text-lngreen">
                <CheckCircle className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs text-lnfaint">Compliant</div>
                <div className="text-sm font-semibold text-lngreen">{summary.compliant}</div>
              </div>
            </div>
          )}
          {summary.nonCompliant !== undefined && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded bg-red-500/10 flex items-center justify-center text-lnred">
                <XCircle className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs text-lnfaint">Non-Compliant</div>
                <div className="text-sm font-semibold text-lnred">{summary.nonCompliant}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {logs.length > 0 && (
        <div className="border-t border-lncard/60">
          <button
            onClick={() => setLogsExpanded(v => !v)}
            className="w-full flex items-center justify-between px-5 py-2.5 text-xs text-lnfaint hover:text-lnmuted hover:bg-lncard/30 transition-colors"
          >
            <span className="font-medium">{logs.length} log lines</span>
            {logsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {logsExpanded && (
            <div
              ref={logRef}
              className="max-h-48 overflow-y-auto px-5 pb-4 font-mono text-xs space-y-0.5"
            >
              {logs.map((line, i) => (
                <div
                  key={i}
                  className={`leading-5 ${
                    line.includes('ERROR') ? 'text-lnred' :
                    line.includes('Sync') || line.includes('sync') ? 'text-lncyan2' :
                    line.includes('complian') || line.includes('Eval') ? 'text-emerald-400' :
                    'text-lnfaint'
                  }`}
                >
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
