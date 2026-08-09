"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Email and password management.
 *
 * Security decisions:
 *  - **Email change** goes through Supabase's secure change flow: a
 *    confirmation link is sent to BOTH the old and the new address, and the
 *    change only lands once both are clicked. Someone who steals a live
 *    session still cannot move the account to an address they control.
 *  - **Password change** requires proof beyond holding the session. If the
 *    account already has a password, the current one must be typed. If it
 *    doesn't (Google or magic-link only), we email a 6-digit nonce and
 *    require it — so setting a first password still proves mailbox control.
 *  - After any password change we offer to **sign out every other device**,
 *    which is the standard response to "someone may have my session".
 */

type Panel = "none" | "email" | "password";

/**
 * Declared here rather than inside the component.
 *
 * A component defined during render is a brand-new type on every render, so
 * React unmounts and remounts its subtree each time — losing any state inside
 * it and restarting animations. It takes only props, so nothing is lost by
 * lifting it out.
 */
function Note({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p className={`mt-3 text-[13px] leading-relaxed ${msg.ok ? "text-mint" : "font-semibold text-warn"}`}>
      {msg.text}
    </p>
  );
}

export default function SecuritySettings({
  currentEmail,
  hasPassword,
}: {
  currentEmail: string;
  hasPassword: boolean;
}) {
  const [panel, setPanel] = useState<Panel>("none");

  /* email */
  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /* password */
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [nonce, setNonce] = useState("");
  const [nonceSent, setNonceSent] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /* other sessions */
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutMsg, setSignOutMsg] = useState<string | null>(null);

  const field =
    "mt-1.5 w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-[15px] outline-none placeholder:text-ink-faint focus:border-brand";

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    const target = newEmail.trim().toLowerCase();
    if (!target || emailBusy) return;
    if (target === currentEmail.toLowerCase()) {
      setEmailMsg({ ok: false, text: "That's already your email address." });
      return;
    }
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      const { error } = await supabaseBrowser().auth.updateUser(
        { email: target },
        { emailRedirectTo: `${window.location.origin}/auth/callback` },
      );
      if (error) throw error;
      setEmailMsg({
        ok: true,
        text:
          `Confirmation links sent to ${currentEmail} and ${target}. ` +
          `Open both to complete the change — until then you keep signing in with your current address.`,
      });
      setNewEmail("");
    } catch (err) {
      setEmailMsg({ ok: false, text: err instanceof Error ? err.message : "Could not start the email change." });
    } finally {
      setEmailBusy(false);
    }
  }

  /** Email a one-time nonce so a first password can't be set from a stolen session alone. */
  async function sendNonce() {
    setPwBusy(true);
    setPwMsg(null);
    try {
      const { error } = await supabaseBrowser().auth.reauthenticate();
      if (error) throw error;
      setNonceSent(true);
      setPwMsg({ ok: true, text: `We emailed a 6-digit code to ${currentEmail}. Enter it below.` });
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : "Could not send the code." });
    } finally {
      setPwBusy(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwBusy) return;
    if (newPw.length < 8) {
      setPwMsg({ ok: false, text: "New password must be at least 8 characters." });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ ok: false, text: "The two new passwords don't match." });
      return;
    }
    setPwBusy(true);
    setPwMsg(null);
    const supabase = supabaseBrowser();

    try {
      if (hasPassword) {
        // prove the current password before allowing a change
        const check = await supabase.auth.signInWithPassword({
          email: currentEmail,
          password: currentPw,
        });
        if (check.error) {
          setPwMsg({ ok: false, text: "Current password is incorrect." });
          return;
        }
        const { error } = await supabase.auth.updateUser({ password: newPw });
        if (error) throw error;
      } else {
        if (!nonce.trim()) {
          setPwMsg({ ok: false, text: "Enter the 6-digit code we emailed you." });
          return;
        }
        const { error } = await supabase.auth.updateUser({ password: newPw, nonce: nonce.trim() });
        if (error) throw error;
      }

      setPwMsg({
        ok: true,
        text: "Password updated. Sign out other devices below if you think someone else had access.",
      });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setNonce("");
      setNonceSent(false);
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : "Could not update the password." });
    } finally {
      setPwBusy(false);
    }
  }

  async function signOutOthers() {
    setSignOutBusy(true);
    setSignOutMsg(null);
    try {
      const { error } = await supabaseBrowser().auth.signOut({ scope: "others" });
      if (error) throw error;
      setSignOutMsg("Signed out everywhere else. This device stays signed in.");
    } catch (err) {
      setSignOutMsg(err instanceof Error ? err.message : "Could not sign out other sessions.");
    } finally {
      setSignOutBusy(false);
    }
  }


  return (
    <div className="card-shadow mt-5 rounded-2xl border border-line bg-surface p-6">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Security</p>

      {/* ---- email ---- */}
      <div className="mt-4 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Email address</p>
            <p className="mt-0.5 text-[13px] text-ink-mute">{currentEmail}</p>
          </div>
          <button
            onClick={() => setPanel(panel === "email" ? "none" : "email")}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink-mute hover:border-brand hover:text-ink"
          >
            {panel === "email" ? "Cancel" : "Change"}
          </button>
        </div>

        {panel === "email" && (
          <form onSubmit={changeEmail} className="mt-4">
            <label htmlFor="new-email" className="text-sm font-semibold">
              New email address
            </label>
            <input
              id="new-email"
              type="email"
              required
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="you@example.com"
              className={field}
            />
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-faint">
              We&apos;ll email a confirmation link to both your current and your new address. The
              change only takes effect once you open both — so a stolen session can&apos;t move your
              account.
            </p>
            <button
              type="submit"
              disabled={emailBusy || !newEmail.trim()}
              className="mt-3 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-40"
            >
              {emailBusy ? "Sending…" : "Send confirmation links"}
            </button>
            <Note msg={emailMsg} />
          </form>
        )}
      </div>

      {/* ---- password ---- */}
      <div className="mt-5 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Password</p>
            <p className="mt-0.5 text-[13px] text-ink-mute">
              {hasPassword ? "Set — you can sign in with email and password" : "Not set — you sign in with a link or Google"}
            </p>
          </div>
          <button
            onClick={() => {
              setPanel(panel === "password" ? "none" : "password");
              setPwMsg(null);
            }}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink-mute hover:border-brand hover:text-ink"
          >
            {panel === "password" ? "Cancel" : hasPassword ? "Change" : "Set password"}
          </button>
        </div>

        {panel === "password" && (
          <form onSubmit={changePassword} className="mt-4">
            {hasPassword ? (
              <>
                <label htmlFor="cur-pw" className="text-sm font-semibold">
                  Current password
                </label>
                <input
                  id="cur-pw"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  className={field}
                />
              </>
            ) : (
              <div className="rounded-xl bg-canvas p-4">
                <p className="text-[13px] leading-relaxed text-ink-mute">
                  Because your account has no password yet, we verify it&apos;s really you by
                  emailing a one-time code.
                </p>
                {!nonceSent ? (
                  <button
                    type="button"
                    onClick={sendNonce}
                    disabled={pwBusy}
                    className="mt-3 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-brand disabled:opacity-40"
                  >
                    {pwBusy ? "Sending…" : "Email me the code"}
                  </button>
                ) : (
                  <>
                    <label htmlFor="nonce" className="mt-3 block text-sm font-semibold">
                      6-digit code
                    </label>
                    <input
                      id="nonce"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      value={nonce}
                      onChange={(e) => setNonce(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456"
                      className={`${field} text-center text-lg tracking-[0.3em] placeholder:tracking-normal`}
                    />
                  </>
                )}
              </div>
            )}

            <label htmlFor="new-pw" className="mt-4 block text-sm font-semibold">
              New password
            </label>
            <input
              id="new-pw"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="At least 8 characters"
              className={field}
            />
            <label htmlFor="confirm-pw" className="mt-4 block text-sm font-semibold">
              Repeat new password
            </label>
            <input
              id="confirm-pw"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className={field}
            />

            <button
              type="submit"
              disabled={pwBusy || (!hasPassword && !nonceSent)}
              className="mt-4 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-40"
            >
              {pwBusy ? "Saving…" : hasPassword ? "Change password" : "Set password"}
            </button>
            <Note msg={pwMsg} />
          </form>
        )}
      </div>

      {/* ---- other sessions ---- */}
      <div className="mt-5 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Other devices</p>
            <p className="mt-0.5 text-[13px] text-ink-mute">
              Sign out everywhere except here — useful after changing your password.
            </p>
          </div>
          <button
            onClick={signOutOthers}
            disabled={signOutBusy}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink-mute hover:border-warn hover:text-ink disabled:opacity-40"
          >
            {signOutBusy ? "Signing out…" : "Sign out others"}
          </button>
        </div>
        {signOutMsg && <p className="mt-3 text-[13px] text-ink-mute">{signOutMsg}</p>}
      </div>
    </div>
  );
}
