"use client";

import { useState } from "react";
import { supabaseBrowser, supabaseConfigured } from "@/lib/supabase/client";

/**
 * Password reset landing page. The user arrives here from the reset email —
 * the callback route has already exchanged the code, so they hold a valid
 * (recovery) session and may set a new password.
 */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setMessage("Passwords don't match.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabaseBrowser().auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => (window.location.href = "/account"), 1500);
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : "Could not set the password. The reset link may have expired — request a new one.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!supabaseConfigured()) {
    return (
      <section className="px-6 py-20">
        <div className="mx-auto max-w-md">
          <div className="card-shadow rounded-2xl border border-warn-line bg-warn-tint p-6 text-sm">
            <p className="font-semibold text-ink">Auth is not configured yet.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Set a new password</h1>
        <div className="card-shadow mt-8 rounded-2xl border border-line bg-surface p-6">
          {done ? (
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mint-tint text-lg">✓</div>
              <p className="mt-4 font-semibold">Password updated.</p>
              <p className="mt-1 text-sm text-ink-mute">Taking you to your account…</p>
            </div>
          ) : (
            <form onSubmit={save}>
              <label htmlFor="pw1" className="text-sm font-semibold">New password</label>
              <input
                id="pw1"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-[15px] outline-none placeholder:text-ink-faint focus:border-brand"
              />
              <label htmlFor="pw2" className="mt-4 block text-sm font-semibold">Repeat it</label>
              <input
                id="pw2"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-[15px] outline-none focus:border-brand"
              />
              <button
                type="submit"
                disabled={busy || !password || !confirm}
                className="mt-5 w-full rounded-xl bg-brand px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-40"
              >
                {busy ? "Saving…" : "Save new password"}
              </button>
              {message && <p className="mt-4 text-sm font-semibold text-warn">{message}</p>}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
