import React from 'react';
import { ChevronsUpDown, Sun, Moon } from 'lucide-react';
import { LinodeAccount } from '../api/accounts';
import { useTheme } from '../context/ThemeContext';
import GlobalSearch from './GlobalSearch';

interface TopBarProps {
  accounts: LinodeAccount[];
  selectedAccount: LinodeAccount | null;
  onSelectAccount: (account: LinodeAccount) => void;
}

export default function TopBar({ accounts, selectedAccount, onSelectAccount }: TopBarProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="h-12 border-b border-lnborder bg-lndark flex items-center justify-between px-5 shrink-0">
      <GlobalSearch selectedAccountId={selectedAccount?.id ?? null} />

      <div className="flex items-center gap-3">
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-lncard border border-transparent hover:border-lnborder transition-colors text-lnfaint hover:text-lnmuted"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {accounts.length > 0 && (
          <div className="relative" ref={ref}>
            <button
              onClick={() => setOpen(v => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded bg-lnbg hover:bg-lncard border border-lnborder hover:border-lnborder2 transition text-sm text-lntext"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-lngreen shrink-0" />
              <span className="max-w-[180px] truncate font-medium">
                {selectedAccount?.name ?? 'Select account'}
              </span>
              <ChevronsUpDown className="w-3 h-3 text-lnfaint shrink-0" />
            </button>

            {open && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-lncard border border-lnborder rounded shadow-2xl overflow-hidden z-50">
                <div className="px-3 py-2 border-b border-lnborder">
                  <span className="text-[10px] font-bold text-lnfaint uppercase tracking-widest">Accounts</span>
                </div>
                <div className="py-1 max-h-72 overflow-y-auto">
                  {accounts.map(acc => (
                    <button
                      key={acc.id}
                      onClick={() => { onSelectAccount(acc); setOpen(false); }}
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
      </div>
    </div>
  );
}
