import React, { useState } from 'react';
import { X, Lock, Eye, EyeOff, Check, Loader2, AlertCircle } from 'lucide-react';
import { authApi } from '../api/auth';
import { api } from '../api/client';

interface ChangePasswordModalProps {
  onClose: () => void;
  userId?: string;
  userName?: string;
  adminReset?: boolean;
}

export default function ChangePasswordModal({ onClose, userId, userName, adminReset = false }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    setSaving(true);
    try {
      if (adminReset && userId) {
        await api.put(`/api/users/${userId}`, { password: newPassword });
      } else {
        await authApi.changePassword(currentPassword, newPassword);
      }
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-lndark border border-lncard rounded-lg w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-lncard">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-lncyan2/10 border border-lncyan2/20 flex items-center justify-center">
              <Lock className="w-4 h-4 text-lncyan2" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-lntext">
                {adminReset ? 'Reset Password' : 'Change Password'}
              </h2>
              {adminReset && userName && (
                <p className="text-xs text-lnmuted mt-0.5">{userName}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-lnmuted hover:text-lntext transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {success ? (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded bg-lngreen/10 border border-lngreen/30 text-lngreen text-sm">
              <Check className="w-4 h-4 shrink-0" />
              Password updated successfully.
            </div>
          ) : (
            <>
              {!adminReset && (
                <div>
                  <label className="block text-xs font-medium text-lnmuted mb-1.5">Current Password</label>
                  <div className="relative">
                    <input
                      type={showCurrent ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      required
                      autoFocus
                      className="w-full bg-lncard border border-lnborder rounded px-3 py-2 pr-9 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2 transition-colors"
                      placeholder="Enter current password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-lnfaint hover:text-lnmuted transition-colors"
                    >
                      {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-lnmuted mb-1.5">New Password</label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    autoFocus={adminReset}
                    className="w-full bg-lncard border border-lnborder rounded px-3 py-2 pr-9 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2 transition-colors"
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-lnfaint hover:text-lnmuted transition-colors"
                  >
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-lnmuted mb-1.5">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    className="w-full bg-lncard border border-lnborder rounded px-3 py-2 pr-9 text-sm text-lntext placeholder-lnfaint focus:outline-none focus:border-lncyan2 transition-colors"
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-lnfaint hover:text-lnmuted transition-colors"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-lnred flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> Passwords do not match.
                </p>
              )}

              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded bg-lnred/10 border border-lnred/30 text-lnred text-xs">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}
            </>
          )}
        </form>

        {!success && (
          <div className="px-6 py-3 border-t border-lncard flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-lnmuted hover:text-lntext bg-lncard hover:bg-lnborder rounded transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !newPassword || !confirmPassword || (!adminReset && !currentPassword)}
              className="flex items-center gap-2 px-4 py-2 bg-lncyan2 hover:bg-lncyan disabled:opacity-40 text-white text-sm rounded font-medium transition"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {adminReset ? 'Reset Password' : 'Update Password'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
