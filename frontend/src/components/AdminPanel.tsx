import React, { useEffect, useState } from 'react';
import { authFetch, useAuth, type Passkey } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { Loader2, UserPlus, Trash2, RefreshCw, Shield, ShieldOff, X, Key } from 'lucide-react';

interface AdminUser {
  username: string;
  enabled: boolean;
  status: string;
  created: string;
  attributes: Record<string, string>;
}

interface AdminPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function AdminPanel({ open, onClose }: AdminPanelProps) {
  const { theme } = useTheme();
  const { registerPasskey, listPasskeys, deletePasskey, user } = useAuth();
  const dark = theme === 'dark';
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [groupsByUser, setGroupsByUser] = useState<Record<string, string[]>>({});
  const [mfa, setMfa] = useState<'OFF' | 'OPTIONAL' | 'ON'>('OPTIONAL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [editingNameUser, setEditingNameUser] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [savingNameUser, setSavingNameUser] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [deletingPasskeyId, setDeletingPasskeyId] = useState<string | null>(null);
  // Nicknames live in our backend (DynamoDB) keyed by credentialId,
  // because Cognito's WebAuthn API doesn't accept a friendly name at
  // registration time.
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingNicknameId, setSavingNicknameId] = useState<string | null>(null);

  const card = dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200';
  const text = dark ? 'text-gray-100' : 'text-gray-900';
  const subtle = dark ? 'text-gray-400' : 'text-gray-600';
  const inputCls = `rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500 ${
    dark ? 'bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
  }`;

  const loadPasskeys = async () => {
    setPasskeysLoading(true);
    try {
      const [list, nickRes] = await Promise.all([
        listPasskeys(),
        authFetch('/api/me/passkeys/nicknames').then((r) => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
      ]);
      setPasskeys(list);
      const map: Record<string, string> = {};
      for (const it of (nickRes.items ?? []) as Array<{ credentialId: string; nickname: string }>) {
        map[it.credentialId] = it.nickname;
      }
      setNicknames(map);
    } catch (err) {
      // Non-fatal — render the rest of the panel even if passkeys fail to load
      console.warn('Failed to load passkeys:', err);
      setPasskeys([]);
      setNicknames({});
    } finally {
      setPasskeysLoading(false);
    }
  };

  const saveNickname = async (credentialId: string | undefined, name: string) => {
    if (!credentialId) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Passkey name cannot be empty');
      return;
    }
    setSavingNicknameId(credentialId);
    setError(null);
    try {
      const r = await authFetch(`/api/me/passkeys/${encodeURIComponent(credentialId)}/nickname`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: trimmed }),
      });
      if (!r.ok) throw new Error(`Save nickname: ${r.status}`);
      setNicknames((prev) => ({ ...prev, [credentialId]: trimmed }));
      setEditingId(null);
      setEditingName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save name');
    } finally {
      setSavingNicknameId(null);
    }
  };

  const startEditNickname = (credentialId: string | undefined, currentName: string) => {
    if (!credentialId) return;
    setEditingId(credentialId);
    setEditingName(currentName);
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, mfaRes] = await Promise.all([
        authFetch('/api/admin/users'),
        authFetch('/api/admin/mfa'),
        loadPasskeys(),
      ]);
      if (!usersRes.ok) throw new Error(`List users: ${usersRes.status}`);
      if (!mfaRes.ok) throw new Error(`Get MFA: ${mfaRes.status}`);
      const usersData = await usersRes.json();
      const mfaData = await mfaRes.json();
      setUsers(usersData.users);
      setMfa(mfaData.mfaConfiguration);
      // Fetch group membership in parallel for each user
      const groups: Record<string, string[]> = {};
      await Promise.all(
        (usersData.users as AdminUser[]).map(async (u) => {
          const r = await authFetch(`/api/admin/users/${encodeURIComponent(u.username)}/groups`);
          if (r.ok) {
            const j = await r.json();
            groups[u.username] = j.groups || [];
          }
        }),
      );
      setGroupsByUser(groups);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void loadAll();
  }, [open]);

  if (!open) return null;

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setInfo(null);
    try {
      const r = await authFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim().toLowerCase(),
          name: newName.trim() || undefined,
          isAdmin: newIsAdmin,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      setInfo(`Invited ${newEmail}. A temporary password has been emailed.`);
      setNewEmail('');
      setNewName('');
      setNewIsAdmin(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const deleteUser = async (username: string) => {
    if (!confirm(`Delete user ${username}? This cannot be undone.`)) return;
    setError(null);
    try {
      const r = await authFetch(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const startEditUserName = (username: string, currentName: string) => {
    setEditingNameUser(username);
    setEditingNameValue(currentName);
  };

  const cancelEditUserName = () => {
    setEditingNameUser(null);
    setEditingNameValue('');
  };

  const saveUserName = async (username: string) => {
    setSavingNameUser(username);
    setError(null);
    try {
      const r = await authFetch(`/api/admin/users/${encodeURIComponent(username)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingNameValue.trim() }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      // Patch the in-memory list so the UI updates immediately without a
      // full reload round-trip.
      setUsers((prev) =>
        prev.map((u) =>
          u.username === username
            ? {
                ...u,
                attributes: {
                  ...u.attributes,
                  ...(editingNameValue.trim()
                    ? { name: editingNameValue.trim() }
                    : (() => { const { name: _drop, ...rest } = u.attributes; void _drop; return rest; })()),
                },
              }
            : u,
        ),
      );
      cancelEditUserName();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save name failed');
    } finally {
      setSavingNameUser(null);
    }
  };

  const resetPassword = async (username: string) => {
    setError(null);
    try {
      const r = await authFetch(`/api/admin/users/${encodeURIComponent(username)}/reset-password`, {
        method: 'POST',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setInfo(`Password reset email sent to ${username}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    }
  };

  const toggleAdmin = async (username: string, makeAdmin: boolean) => {
    setError(null);
    try {
      const r = await authFetch(`/api/admin/users/${encodeURIComponent(username)}/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add: makeAdmin }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const updateMfa = async (next: 'OFF' | 'OPTIONAL' | 'ON') => {
    setError(null);
    try {
      const r = await authFetch('/api/admin/mfa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaConfiguration: next }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setMfa(next);
      setInfo(
        next === 'ON'
          ? 'MFA is now mandatory for all users. Existing users without MFA will be prompted to set it up on next sign-in.'
          : next === 'OPTIONAL'
            ? 'MFA is now optional. Users may enroll TOTP if they wish.'
            : 'MFA is disabled.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const enrollPasskey = async () => {
    // Ask for a friendly name first — Cognito doesn't accept one at
    // registration time, so we store it separately keyed by credentialId.
    const suggestedName = passkeys.length === 0 ? 'My passkey' : `Passkey ${passkeys.length + 1}`;
    const name = prompt(
      'Name for this passkey (e.g., "Touch ID on MacBook" or "Yubikey 5C"):',
      suggestedName,
    );
    if (name === null) return; // user cancelled
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Passkey name cannot be empty');
      return;
    }
    setPasskeyBusy(true);
    setError(null);
    try {
      await registerPasskey();
      // After registering, find the newest credential by createdAt and
      // attach the nickname to it. This is awkward but unavoidable —
      // associateWebAuthnCredential doesn't return the credentialId.
      const list = await listPasskeys();
      setPasskeys(list);
      const newest = list
        .filter((p) => !!p.credentialId)
        .sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        })[0];
      if (newest?.credentialId) {
        try {
          const r = await authFetch(`/api/me/passkeys/${encodeURIComponent(newest.credentialId)}/nickname`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: trimmed }),
          });
          if (r.ok) {
            setNicknames((prev) => ({ ...prev, [newest.credentialId as string]: trimmed }));
          }
        } catch {
          // Nickname save is non-fatal — the passkey itself is registered
        }
      }
      setInfo(`Passkey "${trimmed}" registered. You can use it to sign in next time.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey registration failed');
    } finally {
      setPasskeyBusy(false);
    }
  };

  const removePasskey = async (credentialId: string | undefined) => {
    if (!credentialId) return;
    const displayName = nicknames[credentialId] || 'this passkey';
    if (!confirm(`Remove ${displayName}? You will not be able to sign in with this authenticator anymore.`)) return;
    setDeletingPasskeyId(credentialId);
    setError(null);
    try {
      await deletePasskey(credentialId);
      // Best-effort: also drop the nickname so a future credential with
      // the same id (extremely unlikely but possible) starts fresh.
      authFetch(`/api/me/passkeys/${encodeURIComponent(credentialId)}/nickname`, { method: 'DELETE' }).catch(() => {});
      await loadPasskeys();
      setInfo('Passkey removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove passkey');
    } finally {
      setDeletingPasskeyId(null);
    }
  };

  const formatPasskeyDate = (d: Date | undefined): string => {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className={`w-full max-w-3xl rounded-lg border shadow-xl max-h-[90vh] overflow-y-auto ${card}`}>
        <div className={`flex items-center justify-between px-6 py-4 border-b ${dark ? 'border-gray-800' : 'border-gray-200'}`}>
          <h2 className={`text-lg font-semibold ${text}`}>User & MFA management</h2>
          <button onClick={onClose} className={`p-1 rounded hover:bg-gray-500/10 ${subtle}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className={`rounded-md border px-3 py-2 text-sm ${
              dark ? 'bg-red-950/30 border-red-900 text-red-300' : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {error}
            </div>
          )}
          {info && (
            <div className={`rounded-md border px-3 py-2 text-sm ${
              dark ? 'bg-emerald-950/30 border-emerald-900 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}>
              {info}
            </div>
          )}

          {/* Your account */}
          <section>
            <h3 className={`text-sm font-semibold mb-2 ${text}`}>Your account</h3>
            <div className={`rounded-md border ${dark ? 'border-gray-800' : 'border-gray-200'}`}>
              <div className="p-3">
                <div className={`text-sm font-medium ${text}`}>{user?.email || user?.username}</div>
                <div className={`text-xs ${subtle} mt-0.5`}>
                  Register one or more passkeys (Touch ID, Windows Hello, YubiKey, etc.) for passwordless future sign-ins.
                </div>
              </div>

              {/* Passkey list */}
              <div className={`border-t ${dark ? 'border-gray-800' : 'border-gray-200'}`}>
                {passkeysLoading && passkeys.length === 0 ? (
                  <div className={`px-3 py-2 text-xs ${subtle} flex items-center gap-2`}>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading passkeys…
                  </div>
                ) : passkeys.length === 0 ? (
                  <div className={`px-3 py-2 text-xs ${subtle}`}>
                    No passkeys registered yet.
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-200 dark:divide-gray-800">
                    {passkeys.map((pk) => {
                      const cid = pk.credentialId;
                      const displayName = (cid && nicknames[cid]) || pk.friendlyCredentialName || 'Unnamed passkey';
                      const isEditing = cid && editingId === cid;
                      return (
                        <li key={cid} className="flex items-center justify-between px-3 py-2 gap-3">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Key className={`w-4 h-4 flex-shrink-0 ${subtle}`} />
                            <div className="min-w-0 flex-1">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveNickname(cid, editingName);
                                    if (e.key === 'Escape') { setEditingId(null); setEditingName(''); }
                                  }}
                                  autoFocus
                                  maxLength={64}
                                  className={`${inputCls} text-sm py-1 w-full`}
                                  placeholder="Passkey name"
                                />
                              ) : (
                                <button
                                  onClick={() => startEditNickname(cid, displayName)}
                                  className={`text-sm truncate ${text} text-left hover:underline`}
                                  title="Click to rename"
                                >
                                  {displayName}
                                </button>
                              )}
                              <div className={`text-xs ${subtle}`}>
                                {pk.authenticatorAttachment === 'platform' ? 'Platform authenticator' : pk.authenticatorAttachment === 'cross-platform' ? 'Security key' : 'Authenticator'}
                                {pk.createdAt ? ` · added ${formatPasskeyDate(pk.createdAt)}` : ''}
                              </div>
                            </div>
                          </div>
                          {isEditing ? (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => saveNickname(cid, editingName)}
                                disabled={savingNicknameId === cid}
                                className={`text-xs rounded-md px-2 py-1 bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-50`}
                              >
                                {savingNicknameId === cid ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Save'}
                              </button>
                              <button
                                onClick={() => { setEditingId(null); setEditingName(''); }}
                                className={`text-xs rounded-md px-2 py-1 ${subtle} hover:bg-gray-500/10`}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => removePasskey(cid)}
                              disabled={deletingPasskeyId === cid}
                              className={`flex-shrink-0 p-1.5 rounded text-red-500 hover:bg-red-500/10 disabled:opacity-50`}
                              title="Remove this passkey"
                            >
                              {deletingPasskeyId === cid ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className={`border-t px-3 py-2 flex justify-end ${dark ? 'border-gray-800' : 'border-gray-200'}`}>
                <button
                  onClick={enrollPasskey}
                  disabled={passkeyBusy}
                  className={`text-sm rounded-md border px-3 py-1.5 hover:bg-gray-500/10 disabled:opacity-50 inline-flex items-center gap-1.5 ${dark ? 'border-gray-700 text-gray-100' : 'border-gray-300 text-gray-900'}`}
                >
                  {passkeyBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Key className="w-3 h-3" />}
                  Register {passkeys.length > 0 ? 'another ' : ''}passkey
                </button>
              </div>
            </div>
          </section>

          {/* MFA toggle */}
          <section>
            <h3 className={`text-sm font-semibold mb-2 ${text}`}>Multi-factor authentication</h3>
            <div className={`rounded-md border p-3 ${dark ? 'border-gray-800' : 'border-gray-200'}`}>
              <div className="flex items-center gap-3">
                <select
                  value={mfa}
                  onChange={(e) => updateMfa(e.target.value as 'OFF' | 'OPTIONAL' | 'ON')}
                  className={inputCls}
                >
                  <option value="OFF">Off</option>
                  <option value="OPTIONAL">Optional</option>
                  <option value="ON">Mandatory</option>
                </select>
                <span className={`text-xs ${subtle}`}>
                  Pool-wide. "Mandatory" forces every user to enroll TOTP at next sign-in.
                </span>
              </div>
            </div>
          </section>

          {/* Invite */}
          <section>
            <h3 className={`text-sm font-semibold mb-2 ${text}`}>Invite a user</h3>
            <form onSubmit={createUser} className="flex flex-wrap items-center gap-2">
              <input
                type="email"
                required
                placeholder="user@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className={`${inputCls} flex-1 min-w-[16rem]`}
              />
              <input
                type="text"
                placeholder="Name (optional)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={64}
                className={`${inputCls} flex-1 min-w-[12rem]`}
              />
              <label className={`flex items-center gap-2 text-sm ${text}`}>
                <input type="checkbox" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} />
                Make admin
              </label>
              <button type="submit" disabled={creating} className="rounded-md bg-orange-500 hover:bg-orange-600 text-white text-sm px-3 py-2 flex items-center gap-1 disabled:opacity-50">
                {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                Invite
              </button>
            </form>
            <p className={`text-xs mt-1 ${subtle}`}>
              Cognito will email a temporary password. The user will be required to set a new password on first sign-in.
            </p>
          </section>

          {/* Users */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-sm font-semibold ${text}`}>Users ({users.length})</h3>
              <button onClick={loadAll} className={`text-xs flex items-center gap-1 ${subtle} hover:underline`}>
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            <div className={`rounded-md border overflow-hidden ${dark ? 'border-gray-800' : 'border-gray-200'}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={dark ? 'bg-gray-800' : 'bg-gray-50'}>
                    <th className={`text-left px-3 py-2 ${text}`}>User</th>
                    <th className={`text-left px-3 py-2 ${text}`}>Status</th>
                    <th className={`text-left px-3 py-2 ${text}`}>Admin</th>
                    <th className={`text-right px-3 py-2 ${text}`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isAdmin = (groupsByUser[u.username] || []).includes('Admins');
                    return (
                      <tr key={u.username} className={dark ? 'border-t border-gray-800' : 'border-t border-gray-200'}>
                        <td className={`px-3 py-2 ${text}`}>
                          {editingNameUser === u.username ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editingNameValue}
                                onChange={(e) => setEditingNameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveUserName(u.username);
                                  if (e.key === 'Escape') cancelEditUserName();
                                }}
                                autoFocus
                                maxLength={64}
                                placeholder="Name (or empty to clear)"
                                className={`${inputCls} text-sm py-1 flex-1 min-w-0`}
                              />
                              <button
                                onClick={() => saveUserName(u.username)}
                                disabled={savingNameUser === u.username}
                                className="text-xs rounded-md px-2 py-1 bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-50"
                              >
                                {savingNameUser === u.username ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Save'}
                              </button>
                              <button
                                onClick={cancelEditUserName}
                                className={`text-xs rounded-md px-2 py-1 ${subtle} hover:bg-gray-500/10`}
                              >
                                Cancel
                              </button>
                              <div className={`text-xs ${subtle} hidden sm:block`}>{u.attributes['email'] || u.username}</div>
                            </div>
                          ) : u.attributes['name'] ? (
                            <button
                              onClick={() => startEditUserName(u.username, u.attributes['name'] || '')}
                              className="text-left hover:underline"
                              title="Click to edit name"
                            >
                              <div>{u.attributes['name']}</div>
                              <div className={`text-xs ${subtle}`}>{u.attributes['email'] || u.username}</div>
                            </button>
                          ) : (
                            <button
                              onClick={() => startEditUserName(u.username, '')}
                              className="text-left hover:underline"
                              title="Click to add name"
                            >
                              <div>{u.attributes['email'] || u.username}</div>
                              <div className={`text-xs ${subtle} italic`}>+ add name</div>
                            </button>
                          )}
                        </td>
                        <td className={`px-3 py-2 ${subtle}`}>{u.status}</td>
                        <td className={`px-3 py-2 ${subtle}`}>{isAdmin ? 'Yes' : 'No'}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              title={isAdmin ? 'Remove admin' : 'Make admin'}
                              onClick={() => toggleAdmin(u.username, !isAdmin)}
                              className={`p-1 rounded hover:bg-gray-500/10 ${subtle}`}
                            >
                              {isAdmin ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                            </button>
                            <button
                              title="Reset password"
                              onClick={() => resetPassword(u.username)}
                              className={`p-1 rounded hover:bg-gray-500/10 ${subtle}`}
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                            <button
                              title="Delete user"
                              onClick={() => deleteUser(u.username)}
                              className="p-1 rounded hover:bg-red-500/10 text-red-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
