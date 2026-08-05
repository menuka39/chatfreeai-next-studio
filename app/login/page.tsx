"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser, supabaseConfigured } from "@/lib/supabase/client";

type Method = "link" | "password";
type Stage = "form" | "link-sent" | "verify-code";

/**
 * Supabase reports failures as internal codes. Shown raw they read as
 * something broke in the product rather than something the person can act on,
 * so the ones that actually reach a user are translated here. Anything
 * unrecognised still falls through to the raw reason — a wrong guess is worse
 * than an unfamiliar code.
 *
 * Module scope, not component scope: as a component-level object it would be
 * a fresh reference on every render and become a churning effect dependency.
 */
const ERROR_TEXT: Record<string, string> = {
  otp_expired: "That sign-in link has expired. Request a new one below.",
  access_denied: "That sign-in link is no longer valid. Request a new one below.",
  invalid_request: "That sign-in link was incomplete. Request a new one below.",
  missing_code: "That sign-in link was incomplete. Request a new one below.",
  session_not_found: "Your session has expired. Please sign in again.",
  not_configured: "Sign-in isn't available right now. Please try again shortly.",
  // Supabase codes seen in real use — each is meaningless to a user, so each
  // gets a message that says what actually went wrong and what to do next
  flow_state_not_found: "That sign-in link has already been used. Request a new one below.",
  flow_state_expired: "That sign-in link took too long to open. Request a new one below.",
  bad_code_verifier: "That link was opened in a different browser than the one that requested it. Use the 6-digit code below instead.",
  email_not_confirmed: "Confirm your email first — check your inbox for the link we sent.",
  over_email_send_rate_limit: "Too many emails requested. Wait a minute, then try again.",
  validation_failed: "That email address doesn't look right. Check it and try again.",
  server_error: "Something went wrong on our side. Please try again in a moment.",
};

export default function LoginPage() {
  const [method, setMethod] = useState<Method>("link");
  const [stage, setStage] = useState<Stage>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [tone, setTone] = useState<"error" | "notice">("error");
  const [notice, setNotice] = useState<string | null>(null);
  const [codeHint, setCodeHint] = useState(false);

  const ready = supabaseConfigured();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // a prompt, not a failure — e.g. landing on /account before signing in
    if (params.get("notice") === "signin_required") {
      setTone("notice");
      setMessage("Sign in to see your account.");
      window.history.replaceState({}, "", "/login");
      return;
    }

    const reason = params.get("error");
    if (!reason) return;

    // Nothing is shown on screen for these. They arrive from a redirect, so
    // the person has not just pressed anything — an error banner about a
    // failure they never saw happen reads as a broken site rather than as
    // help. The reason is logged instead, and where a 6-digit code would get
    // them past it, that option is quietly surfaced below.
    console.warn("[login] sign-in error:", reason);
    if (/code verifier|flow state|expired|invalid|denied|session|otp/i.test(reason)) {
      setCodeHint(true);
    }
    // clean the URL so a refresh doesn't re-trigger any of this
    window.history.replaceState({}, "", "/login");
  }, []);

  /**
   * Show something a person can act on, never a raw error identifier.
   *
   * Supabase errors carry a snake_case `code` and a `message` that is
   * usually — but not always — a readable sentence. Both can be internal
   * vocabulary like `session_not_found`, which tells a user nothing and makes
   * the site look broken. So: try the code against the known-message table
   * first, then use the message only if it actually reads as English, and
   * otherwise fall back to the caller's plain-language default. The original
   * always goes to the console.
   */
  const fail = (err: unknown, fallback: string) => {
    const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
    const raw = err instanceof Error ? err.message : "";
    console.warn("[login] error:", { code, message: raw });

    // an identifier has no spaces and uses underscores; a sentence doesn't
    const looksLikeCode = (s: string) => !s.includes(" ") && (s.includes("_") || s.length < 4);

    setMessage(ERROR_TEXT[code] ?? (raw && !looksLikeCode(raw) ? raw : fallback));
  };

  /* ---------------- magic link ---------------- */
  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabaseBrowser().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setStage("link-sent");
    } catch (err) {
      fail(err, "Could not send the link. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- password sign in ---------------- */
  async function passwordSignIn() {
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabaseBrowser().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        // account exists but email never confirmed -> push into code verification
        if (/confirm/i.test(error.message)) {
          await resendCode();
          setStage("verify-code");
          setNotice("Your email isn't verified yet. We've sent you a new 6-digit code.");
          return;
        }
        throw error;
      }
      window.location.href = "/account";
    } catch (err) {
      fail(err, "Sign-in failed. Check your email and password.");
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- password sign up -> email code ---------------- */
  async function passwordSignUp() {
    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { data, error } = await supabaseBrowser().auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      // identities empty => the email is already registered (Supabase anti-enumeration)
      if (data.user && data.user.identities?.length === 0) {
        setMessage("That email is already registered. Sign in instead — or reset your password.");
        return;
      }
      setStage("verify-code");
      setNotice(`We emailed a 6-digit code to ${email.trim()}. Enter it below to verify your account.`);
    } catch (err) {
      fail(err, "Could not create the account. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- verify the emailed code ---------------- */
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length < 6 || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      // the same 6-digit code is issued for magic links ("email") and for new
      // password accounts ("signup") — try both so one input handles each case
      const supabase = supabaseBrowser();
      const first = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "email",
      });
      if (first.error) {
        const retry = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: code.trim(),
          type: "signup",
        });
        if (retry.error) throw retry.error;
      }
      window.location.href = "/account";
    } catch {
      setMessage("That code is wrong or has expired. Check the newest email, or resend.");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    try {
      const supabase = supabaseBrowser();
      // signup resend fails for an already-confirmed account; fall back to a
      // fresh magic-link OTP, which carries a code too
      const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
      if (error) {
        await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
      }
      setNotice("A fresh code is on its way. Codes expire after a few minutes.");
      setMessage(null);
    } catch {
      setMessage("Could not resend. Wait a minute and try again.");
    }
  }

  async function forgotPassword() {
    if (!email.trim()) {
      setMessage("Type your email above first, then press Forgot password.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
      });
      if (error) throw error;
      setNotice(`Password reset link sent to ${email.trim()}.`);
    } catch (err) {
      fail(err, "Could not send the reset link.");
    } finally {
      setBusy(false);
    }
  }

  async function googleLogin() {
    try {
      await supabaseBrowser().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
    } catch {
      setMessage("Google sign-in failed to start. Try again.");
    }
  }

  /* ================= render ================= */

  if (!ready) {
    return (
      <section className="px-6 py-20">
        <div className="mx-auto max-w-md">
          <div className="card-shadow rounded-2xl border border-warn-line bg-warn-tint p-6 text-sm">
            <p className="font-semibold text-ink">Auth is not configured yet.</p>
            <p className="mt-2 text-ink-mute">
              Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> — see DEPLOY.md.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Log in or sign up</h1>
        <p className="mt-3 text-ink-mute">Use Google, an emailed link, or a password — your choice.</p>

        <div className="card-shadow mt-8 rounded-2xl border border-line bg-surface p-6">
          {/* -------- link sent -------- */}
          {stage === "link-sent" ? (
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mint-tint text-lg">✉️</div>
              <h2 className="mt-4 font-display text-xl font-semibold">Check your email</h2>
              <p className="mt-2 text-sm text-ink-mute">
                We sent a sign-in link to <span className="font-semibold text-ink">{email}</span>. Open
                it and you&apos;re in — it expires in one hour.
              </p>
              <p className="mt-3 text-sm text-ink-mute">
                Reading your email on another device? The same message contains a 6-digit code —
                type it here instead.
              </p>
              <button
                onClick={() => { setStage("verify-code"); setNotice(`Enter the 6-digit code we emailed to ${email}.`); }}
                className="mt-4 w-full rounded-xl border border-line px-5 py-3 text-[15px] font-semibold text-ink transition-colors hover:border-brand"
              >
                Enter the code instead
              </button>
              <button onClick={() => setStage("form")} className="mt-4 text-sm font-semibold text-brand hover:text-brand-deep">
                Back
              </button>
            </div>
          ) : stage === "verify-code" ? (
            /* -------- 6-digit code verification -------- */
            <form onSubmit={verifyCode}>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-tint text-lg">🔐</div>
              <h2 className="mt-4 font-display text-xl font-semibold">Verify your email</h2>
              {notice && <p className="mt-2 text-sm text-ink-mute">{notice}</p>}
              <label htmlFor="otp" className="mt-4 block text-sm font-semibold">
                6-digit code
              </label>
              <input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-center text-[22px] font-semibold tracking-[0.4em] outline-none placeholder:tracking-normal placeholder:text-ink-faint focus:border-brand"
              />
              <button
                type="submit"
                disabled={busy || code.length < 6}
                className="mt-4 w-full rounded-xl bg-brand px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-40"
              >
                {busy ? "Verifying…" : "Verify and continue"}
              </button>
              <div className="mt-4 flex justify-between text-sm">
                <button type="button" onClick={resendCode} className="font-semibold text-brand hover:text-brand-deep">
                  Resend code
                </button>
                <button type="button" onClick={() => { setStage("form"); setMessage(null); setNotice(null); }} className="text-ink-faint hover:text-ink">
                  Back
                </button>
              </div>
              {message && (
                <p className={`mt-4 text-sm font-semibold ${tone === "notice" ? "text-ink-mute" : "text-warn"}`}>{message}</p>
              )}
            </form>
          ) : (
            /* -------- main form -------- */
            <div>
              <button
                onClick={googleLogin}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-line px-5 py-3 text-[15px] font-semibold text-ink transition-colors hover:border-ink-faint"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                  <path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.46a5.53 5.53 0 0 1-2.4 3.62v3h3.87c2.27-2.09 3.57-5.17 3.57-8.86z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z" />
                  <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.9 12c0-.8.14-1.57.37-2.29v-3.1H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.39l3.98-3.1z" />
                  <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.61l3.98 3.1C6.22 6.86 8.87 4.75 12 4.75z" />
                </svg>
                Continue with Google
              </button>

              <div className="my-5 flex items-center gap-3 text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
                <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
              </div>

              {/* method toggle */}
              <div className="flex rounded-xl border border-line p-1">
                {(["link", "password"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMethod(m); setMessage(null); }}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                      method === m ? "bg-brand-tint text-brand-deep" : "text-ink-mute hover:text-ink"
                    }`}
                  >
                    {m === "link" ? "Email link" : "Password"}
                  </button>
                ))}
              </div>

              <form onSubmit={method === "link" ? sendMagicLink : (e) => e.preventDefault()} className="mt-4">
                <label htmlFor="email" className="text-sm font-semibold">Email address</label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-[15px] outline-none placeholder:text-ink-faint focus:border-brand"
                />

                {method === "link" ? (
                  <>
                    <button
                      type="submit"
                      disabled={busy || !email.trim()}
                      className="mt-4 w-full rounded-xl bg-brand px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-40"
                    >
                      {busy ? "Sending link…" : "Email me a sign-in link"}
                    </button>
                    <p className="mt-3 text-[12.5px] text-ink-faint">
                      No password needed — we email you a one-time link. New accounts are created automatically.
                    </p>
                  </>
                ) : (
                  <>
                    <label htmlFor="pw" className="mt-4 block text-sm font-semibold">Password</label>
                    <input
                      id="pw"
                      type="password"
                      autoComplete="current-password"
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-[15px] outline-none placeholder:text-ink-faint focus:border-brand"
                    />
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={passwordSignIn}
                        disabled={busy || !email.trim() || !password}
                        className="rounded-xl bg-brand px-4 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-40"
                      >
                        {busy ? "…" : "Sign in"}
                      </button>
                      <button
                        type="button"
                        onClick={passwordSignUp}
                        disabled={busy || !email.trim() || !password}
                        className="rounded-xl border border-line px-4 py-3 text-[15px] font-semibold text-ink transition-colors hover:border-brand disabled:opacity-40"
                      >
                        Create account
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <button type="button" onClick={forgotPassword} className="text-[13px] font-semibold text-brand hover:text-brand-deep">
                        Forgot password?
                      </button>
                      <p className="text-[12px] text-ink-faint">New accounts verify by email code</p>
                    </div>
                  </>
                )}
              </form>

              {notice && <p className="mt-4 text-sm font-medium text-mint">{notice}</p>}
              {message && (
                <div className={`mt-4 rounded-xl border p-4 ${tone === "notice" ? "border-line bg-canvas" : "border-warn-line bg-warn-tint"}`}>
                  <p className="text-sm font-semibold text-ink">{message}</p>
                  {codeHint && email.trim() && (
                    <button
                      onClick={() => { setStage("verify-code"); setNotice(`Enter the 6-digit code from the email we sent to ${email}.`); setMessage(null); }}
                      className="mt-3 text-sm font-semibold text-brand hover:text-brand-deep"
                    >
                      Enter the 6-digit code instead →
                    </button>
                  )}
                </div>
              )}

              <p className="mt-5 text-[12.5px] leading-relaxed text-ink-faint">
                Passwords are hashed with bcrypt and checked against known-breach lists. By continuing
                you agree to our <Link href="/terms" className="underline">terms</Link>.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
