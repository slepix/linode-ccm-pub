import React, { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SyncProvider, useSync } from './context/SyncContext';
import LoginPage from './pages/LoginPage';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import DashboardPage from './pages/DashboardPage';
import CompliancePage from './pages/CompliancePage';
import ResourcesPage from './pages/ResourcesPage';
import AccountsPage from './pages/AccountsPage';
import EventsPage from './pages/EventsPage';
import UsersPage from './pages/UsersPage';
import RulesPage from './pages/RulesPage';
import ComplianceSettingsPage from './pages/ComplianceSettingsPage';
import ReportsPage from './pages/ReportsPage';
import McpPage from './pages/McpPage';
import OnboardingWizard from './components/OnboardingWizard';
import { accountsApi, LinodeAccount } from './api/accounts';
import SyncProgressPanel from './components/SyncProgressPanel';
import { Loader2 } from 'lucide-react';

function AppShell() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [accounts, setAccounts] = useState<LinodeAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<LinodeAccount | null>(null);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const { showProgress, syncPhase, syncLogs, syncSummary, dismissProgress } = useSync();

  const currentView = location.pathname.replace('/', '') || 'dashboard';

  const loadAccounts = async () => {
    try {
      const acc = await accountsApi.list();
      setAccounts(acc);
      if (acc.length > 0 && !selectedAccount) {
        setSelectedAccount(acc[0]);
      }
    } catch {}
    setAccountsLoaded(true);
  };

  useEffect(() => {
    if (user) loadAccounts();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-lnbg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-lncyan2 animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  const showOnboarding =
    accountsLoaded &&
    accounts.length === 0 &&
    user.role === 'admin' &&
    currentView !== 'accounts';

  const handleOnboardingComplete = async () => {
    await loadAccounts();
    navigate('/dashboard');
  };

  return (
    <div className="flex h-screen bg-lnbg overflow-hidden">
      <Sidebar
        currentView={currentView}
        onNavigate={view => navigate(`/${view}`)}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          accounts={accounts}
          selectedAccount={selectedAccount}
          onSelectAccount={acc => {
            setSelectedAccount(acc);
            navigate('/dashboard');
          }}
        />
        {showProgress && (
          <div className="px-6 pt-4 shrink-0">
            <SyncProgressPanel
              phase={syncPhase}
              logs={syncLogs}
              summary={syncSummary}
              onDismiss={dismissProgress}
            />
          </div>
        )}
        <main className="flex-1 overflow-auto flex flex-col">
          {showOnboarding ? (
            <OnboardingWizard
              onComplete={handleOnboardingComplete}
            />
          ) : (
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage account={selectedAccount} onAccountUpdated={loadAccounts} />} />
              <Route path="/compliance" element={<CompliancePage account={selectedAccount} />} />
              <Route path="/reports" element={<ReportsPage account={selectedAccount} />} />
              <Route path="/resources" element={<ResourcesPage account={selectedAccount} />} />
              <Route path="/events" element={<EventsPage account={selectedAccount} />} />
              <Route path="/rules" element={
                (user?.role === 'admin' || user?.role === 'power_user')
                  ? <RulesPage account={selectedAccount} />
                  : <Navigate to="/dashboard" replace />
              } />
              <Route path="/accounts" element={<AccountsPage accounts={accounts} onChanged={loadAccounts} />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/compliance-settings" element={<ComplianceSettingsPage account={selectedAccount} />} />
              <Route path="/mcp" element={<McpPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </div>
  );
}

function AppInner() {
  return (
    <SyncProvider>
      <Routes>
        <Route path="/*" element={<AppShell />} />
      </Routes>
    </SyncProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
