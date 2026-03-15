import React, { createContext, useContext, useRef, useState } from 'react';
import { streamRefresh, SyncEvent } from '../api/refresh';
import { Phase, SyncSummary } from '../components/SyncProgressPanel';

interface SyncContextValue {
  syncPhase: Phase;
  syncLogs: string[];
  syncSummary: SyncSummary;
  showProgress: boolean;
  syncing: boolean;
  complianceVersion: number;
  startSync: (accountId: string, onDone?: () => void) => void;
  dismissProgress: () => void;
  notifyComplianceUpdated: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [syncPhase, setSyncPhase] = useState<Phase>('idle');
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [syncSummary, setSyncSummary] = useState<SyncSummary>({});
  const [showProgress, setShowProgress] = useState(false);
  const [complianceVersion, setComplianceVersion] = useState(0);
  const stopStreamRef = useRef<(() => void) | null>(null);

  const notifyComplianceUpdated = () => setComplianceVersion(v => v + 1);

  const syncing = showProgress && syncPhase !== 'done' && syncPhase !== 'error';

  const startSync = (accountId: string, onDone?: () => void) => {
    if (syncing) return;

    if (stopStreamRef.current) {
      stopStreamRef.current();
      stopStreamRef.current = null;
    }

    setSyncPhase('sync');
    setSyncLogs([]);
    setSyncSummary({});
    setShowProgress(true);

    const stop = streamRefresh(
      { account_id: accountId },
      (event: SyncEvent) => {
        if (event.type === 'phase') {
          setSyncPhase(event.phase === 'sync' ? 'sync' : 'evaluate');
        } else if (event.type === 'log') {
          setSyncLogs(prev => [...prev, event.message]);
        } else if (event.type === 'sync_done') {
          setSyncSummary(prev => ({ ...prev, syncCount: event.count }));
        } else if (event.type === 'eval_done') {
          setSyncSummary(prev => ({
            ...prev,
            evaluated: event.result.evaluated,
            compliant: event.result.compliant,
            nonCompliant: event.result.non_compliant,
            score: event.result.score,
          }));
        } else if (event.type === 'done') {
          setSyncPhase('done');
          setComplianceVersion(v => v + 1);
          onDone?.();
        } else if (event.type === 'error') {
          setSyncPhase('error');
          setSyncLogs(prev => [...prev, `ERROR: ${event.message}`]);
        }
      },
      () => {
        setSyncPhase(prev => (prev !== 'done' && prev !== 'error' ? 'error' : prev));
      },
    );

    stopStreamRef.current = stop;
  };

  const dismissProgress = () => {
    setShowProgress(false);
    setSyncPhase('idle');
    setSyncLogs([]);
    setSyncSummary({});
  };

  return (
    <SyncContext.Provider value={{
      syncPhase,
      syncLogs,
      syncSummary,
      showProgress,
      syncing,
      complianceVersion,
      startSync,
      dismissProgress,
      notifyComplianceUpdated,
    }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
