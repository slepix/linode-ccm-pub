import React from 'react';
import { ChevronsUpDown, Sun, Moon, Lock, LogOut, ShieldCheck } from 'lucide-react';
import { LinodeAccount } from '../api/accounts';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import GlobalSearch from './GlobalSearch';
import ChangePasswordModal from './ChangePasswordModal';
import TwoFactorSetupModal from './TwoFactorSetupModal';

interface TopBarProps {
  accounts: LinodeAccount[];
  selectedAccount: LinodeAccount | null;
  onSelectAccount: (account: LinodeAccount) => void;
}

export default function TopBar({ accounts, selectedAccount, onSelectAccount }: TopBarProps) {
  const [accountOpen, setAccountOpen] = React.useState(false);
  const [userOpen, setUserOpen] = React.useState(false);
  const [showChangePassword, setShowChangePassword] = React.useState(false);
  const [show2fa, setShow2fa] = React.useState(false);
  const accountRef = React.useRef<HTMLDivElement>(null);
  const userRef = React.useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const initials = user
    ? (user.full_name || user.email).split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <>
      <div className="h-12 border-b border-lnborder bg-lndark flex items-center justify-between px-5 shrink-0">
        <GlobalSearch selectedAccountId={selectedAccount?.id ?? null} />

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-lncard border border-transparent hover:border-lnborder transition-colors text-lnfaint hover:text-lnmuted"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {accounts.length > 0 && (
            <div className="relative" ref={accountRef}>
              <button
                onClick={() => setAccountOpen(v => !v)}
                className="flex items-center gap-2 px-3 py-1.5 rounded bg-lnbg hover:bg-lncard border border-lnborder hover:border-lnborder2 transition text-sm text-lntext"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-lngreen shrink-0" />
                <span className="max-w-[180px] truncate font-medium">
                  {selectedAccount?.name ?? 'Select account'}
                </span>
                <ChevronsUpDown className="w-3 h-3 text-lnfaint shrink-0" />
              </button>

              {accountOpen && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-lncard border border-lnborder rounded shadow-2xl overflow-hidden z-50">
                  <div className="px-3 py-2 border-b border-lnborder">
                    <span className="text-[10px] font-bold text-lnfaint uppercase tracking-widest">Accounts</span>
                  </div>
                  <div className="py-1 max-h-72 overflow-y-auto">
                    {accounts.map(acc => (
                      <button
                        key={acc.id}
                        onClick={() => { onSelectAccount(acc); setAccountOpen(false); }}
                        className={`w-full text-left px-3 py-2.5 text-sm transition flex items-start gap-2.5 ${
                          selectedAccount?.id === acc.id
                            ? 'bg-lncyan2/10 text-lncyan2'
                            : 'text-lntext hover:bg-lnborder'
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                          selectedAccount?.id === acc.id ? 'bg-lncyan2' : 'bg-lnfaint'
                        }`} />
                        <div>
                          <div className="font-medium truncate">{acc.name}</div>
                          {acc.last_sync_at && (
                            <div className="text-xs text-lnfaint mt-0.5">
                              Synced {new Date(acc.last_sync_at).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="relative" ref={userRef}>
            <button
              onClick={() => setUserOpen(v => !v)}
              title={user?.email}
              className="w-8 h-8 rounded-full bg-lncyan2/15 border border-lncyan2/30 flex items-center justify-center text-xs font-semibold text-lncyan2 hover:bg-lncyan2/25 transition-colors"
            >
              {initials}
            </button>

            {userOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-lncard border border-lnborder rounded shadow-2xl overflow-hidden z-50">
                <div className="px-3 py-3 border-b border-lnborder">
                  <div className="text-sm font-medium text-lntext truncate">{user?.full_name || user?.email}</div>
                  <div className="text-xs text-lnfaint truncate mt-0.5">{user?.email}</div>
                  <div className="mt-1.5">
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-lnborder text-lnmuted capitalize">
                      {user?.role?.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => { setUserOpen(false); setShowChangePassword(true); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-lnmuted hover:text-lntext hover:bg-lnborder transition-colors text-left"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Change Password
                  </button>
                  <button
                    onClick={() => { setUserOpen(false); setShow2fa(true); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-lnmuted hover:text-lntext hover:bg-lnborder transition-colors text-left"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Two-Factor Auth
                  </button>
                  <div className="h-px bg-lnborder mx-3 my-1" />
                  <button
                    onClick={() => { setUserOpen(false); logout(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-lnmuted hover:text-lnred hover:bg-lnred/10 transition-colors text-left"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}

      {show2fa && (
        <TwoFactorSetupModal onClose={() => setShow2fa(false)} />
      )}
    </>
  );
}
