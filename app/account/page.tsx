import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer, supabaseEnvPresent, serviceQuery } from "@/lib/supabase/server";
import { packages, packageById } from "@/lib/packages";
import { effectiveResumePass } from "@/lib/plan-limits";
import AccountActions from "@/components/AccountActions";
import SecuritySettings from "@/components/SecuritySettings";
import PassActions from "@/components/resume/PassActions";

export const metadata: Metadata = { title: "Your account" };
export const dynamic = "force-dynamic";

interface ProfileRow {
  package_id: string | null;
  subscription_status: string | null;
  paypal_subscription_id: string | null;
  current_period_start: string | null;
  resume_pass_expires_at: string | null;
}

export default async function AccountPage() {
  if (!supabaseEnvPresent()) {
    return (
      <section className="px-6 py-20">
        <div className="mx-auto max-w-md">
          <div className="card-shadow rounded-2xl border border-warn-line bg-warn-tint p-6 text-sm">
            <p className="font-semibold text-ink">Auth is not configured yet.</p>
            <p className="mt-2 text-ink-mute">Set the Supabase env vars — see DEPLOY.md.</p>
          </div>
        </div>
      </section>
    );
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?notice=signin_required");

  const rows = await serviceQuery<ProfileRow[]>(
    `profiles?id=eq.${user.id}&select=package_id,subscription_status,paypal_subscription_id,current_period_start,resume_pass_expires_at&limit=1`,
  );
  const profile = rows?.[0] ?? null;
  const resumePass = await effectiveResumePass();

  // identities tell us which sign-in methods exist: "email" means a password
  // has been set, "google" means OAuth.
  const providers = (user.identities ?? []).map((i) => i.provider);
  const hasPassword = providers.includes("email");
  const pkg = profile?.package_id ? packageById(profile.package_id) : null;
  const status = profile?.subscription_status ?? null;

  return (
    <section className="px-6 py-14">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Your account</h1>

        {/* Identity */}
        <div className="card-shadow mt-8 rounded-2xl border border-line bg-surface p-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Signed in as</p>
          <p className="mt-1 text-lg font-semibold">{user.email}</p>
          <p className="mt-1 text-[13px] text-ink-faint">
            Sign-in {providers.length > 1 ? "methods" : "method"}:{" "}
            {providers.length
              ? providers.map((p) => (p === "email" ? "email + password" : p === "google" ? "Google" : p)).join(" · ")
              : "email link"}
          </p>
        </div>

        <SecuritySettings currentEmail={user.email ?? ""} hasPassword={hasPassword} />

        {/* Plan */}
        <div className="card-shadow mt-5 rounded-2xl border border-line bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Current plan</p>
              <p className="mt-1 text-lg font-semibold">
                {pkg ? `${pkg.name} — $${pkg.price}/month` : "Free"}
              </p>
              {pkg && (
                <p className="mt-1 text-[13px] text-ink-mute">
                  {(pkg.credits / 1_000_000).toLocaleString()}M credits a month · every model, image,
                  video and voice tool
                </p>
              )}
              {status === "cancelling" && (
                <p className="mt-2 inline-block rounded-full bg-warn-tint px-3 py-1 text-[12px] font-semibold text-warn">
                  Cancelled — active until the end of the paid period
                </p>
              )}
            </div>
          </div>

          <AccountActions
            hasActivePlan={Boolean(pkg && status === "active")}
            currentPackageId={profile?.package_id ?? null}
          />
        </div>

        <PassActions
          expiresAt={profile?.resume_pass_expires_at ?? null}
          hasPackage={Boolean(pkg)}
          price={resumePass.price}
          days={resumePass.days}
        />

        {/* Payment method */}
        <div className="card-shadow mt-5 rounded-2xl border border-line bg-surface p-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Payment method</p>
          {pkg ? (
            <>
              <p className="mt-2 text-sm text-ink">
                Billed through <span className="font-semibold">PayPal</span>
                {profile?.paypal_subscription_id && (
                  <span className="ml-2 rounded bg-canvas px-2 py-0.5 font-mono text-[12px] text-ink-faint">
                    {profile.paypal_subscription_id}
                  </span>
                )}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-mute">
                Your card details are held by PayPal (PCI-DSS Level 1) — they never touch our
                servers, so there is nothing here for anyone to steal. Add, change or remove cards
                in your PayPal wallet:
              </p>
              <a
                href="https://www.paypal.com/myaccount/money/cards"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-brand"
              >
                Manage cards in PayPal ↗
              </a>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-mute">
              No payment method on file. When you subscribe, payment is handled by PayPal — your
              card details never touch our servers.
            </p>
          )}
        </div>

        {/* Upgrade options for free users */}
        {!pkg && (
          <div className="mt-8">
            <h2 className="font-display text-xl font-semibold">Pick a package</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {packages.map((p) => (
                <div key={p.id} className="rounded-xl border border-line bg-surface p-4">
                  <p className="font-semibold">{p.name}</p>
                  <p className="mt-1 text-2xl font-semibold">
                    ${p.price}
                    <span className="text-sm font-medium text-ink-mute">/mo</span>
                  </p>
                  <p className="mt-1 text-[12.5px] text-ink-mute">
                    {(p.credits / 1_000_000).toLocaleString()}M credits
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-ink-faint">
              Full comparison on the <Link href="/pricing" className="underline">pricing page</Link>.
            </p>
          </div>
        )}

        {/* Sign out */}
        <form action="/api/account/signout" method="post" className="mt-10">
          <button className="text-sm font-semibold text-ink-faint hover:text-ink">Sign out</button>
        </form>
      </div>
    </section>
  );
}
