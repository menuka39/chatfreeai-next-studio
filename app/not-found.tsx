import Link from "next/link";

export default function NotFound() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-md text-center">
        <p className="font-display text-6xl font-semibold text-brand">404</p>
        <h1 className="mt-4 font-display text-2xl font-semibold">That page doesn&apos;t exist</h1>
        <p className="mt-3 text-ink-mute">
          The link may be old or mistyped. Here is everything the site has:
        </p>
        {/*
          A real 404 with somewhere to go, rather than a redirect to the
          homepage. Sending every unknown URL to the homepage looks tidier but
          Google reads it as a soft 404 — the page is dropped from the index
          regardless, and genuine broken links stop showing up in Search
          Console where they can be found and fixed.
        */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep">
            Open the chat
          </Link>
          <Link href="/tools" className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-brand">
            All tools
          </Link>
          <Link href="/blog" className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-brand">
            Blog
          </Link>
          <Link href="/pricing" className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-brand">
            Pricing
          </Link>
        </div>
      </div>
    </section>
  );
}
