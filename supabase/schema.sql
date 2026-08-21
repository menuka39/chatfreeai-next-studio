-- SAFE TO RE-RUN: every statement here is idempotent, so applying this
-- file again after adding a table is the intended way to migrate.
-- ============================================================
-- Chat Free AI — Supabase schema
-- Run once in the Supabase SQL editor (Dashboard -> SQL).
-- ============================================================

-- Profile row per auth user, created automatically on signup.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  package_id text,                        -- 'starter' | 'pro' | 'promax' | null
  subscription_status text,               -- 'active' | 'cancelling' | 'cancelled' | null
  paypal_subscription_id text,
  current_period_start date,
  resume_pass_expires_at timestamptz,   -- 5-day Resume Pass, written only by the server
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Auto-create a profile when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Row Level Security — the whole point.
-- Users can READ their own profile. Nobody can write plan fields
-- from the client: subscriptions are written ONLY by the server
-- (service role) after a verified PayPal webhook.
-- ============================================================
alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

-- No insert/update/delete policies for the anon or authenticated roles:
-- clients cannot grant themselves a package. The service role bypasses RLS.

-- ---------------------------------------------------------------------------
-- Tool Submissions — free FIFO queue + paid Priority Listing
-- ---------------------------------------------------------------------------
create table if not exists public.tool_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null,
  tagline text not null,
  description text not null,
  website_url text not null,
  category text not null,
  contact_email text not null,
  tier text not null check (tier in ('free','6h','24h','48h','72h')),
  -- awaiting_payment: a priority order was created but not yet captured (drop after ~1h if unpaid)
  -- pending: in the queue, actively counted for free-queue ETA if tier='free'
  -- live: approved and shown on the site
  -- rejected: reviewed and declined
  status text not null default 'pending' check (status in ('awaiting_payment','pending','live','rejected')),
  paid_via_package boolean not null default false,
  paypal_order_id text,
  amount_paid numeric(10,2),
  submitted_at timestamptz not null default now(),
  -- set once paid/queued: submitted_at + tier hours (priority) — free tier's
  -- ETA is intentionally NOT stored here; it's computed live from queue
  -- position so it reflects reality even if the review rate changes
  review_due_at timestamptz,
  live_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tool_submissions_queue_idx
  on public.tool_submissions (tier, status, submitted_at)
  where tier = 'free' and status = 'pending';

alter table public.tool_submissions enable row level security;

-- submitters can create and read their own submissions
drop policy if exists "insert own submission" on public.tool_submissions;
create policy "insert own submission" on public.tool_submissions
  for insert with check (auth.uid() = user_id);
drop policy if exists "read own submissions" on public.tool_submissions;
create policy "read own submissions" on public.tool_submissions
  for select using (auth.uid() = user_id);

-- status/payment/review fields are never client-writable — only the webhook
-- and the service-role-driven capture route touch them, same pattern as
-- profiles.subscription_status elsewhere in this schema
-- (no update/delete policy for authenticated users = no client writes at all)

-- public directory: anyone can see LIVE listings (adjust once a public
-- /tools/directory page exists; harmless until then since nothing queries it)
drop policy if exists "read live listings" on public.tool_submissions;
create policy "read live listings" on public.tool_submissions
  for select using (status = 'live');

-- ---------------------------------------------------------------------------
-- Admin panel — role flag, site settings, managed secrets, blog CMS
-- ---------------------------------------------------------------------------

-- Admin is a flag on the SAME account system everyone already uses (magic
-- link / password / Google) — there's no separate admin login. Nobody can
-- grant this to themselves: it's never client-writable (no RLS insert/update
-- policy touches it), only set directly in the database.
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Bootstrap the first admin manually, once, after running this file:
--   update public.profiles set is_admin = true where email = 'you@example.com';

-- Simple key/value site settings (logo URL, site name, tagline, ...).
-- Publicly readable (the site itself needs these to render for anonymous
-- visitors) — only the service role writes.
create table if not exists public.site_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
drop policy if exists "anyone can read settings" on public.site_settings;
create policy "anyone can read settings" on public.site_settings for select using (true);
-- no insert/update/delete policy = no client writes at all; only the
-- service-role-driven /api/admin/settings route can change these

-- NOTE: there was a `managed_secrets` table here for rotating the OpenRouter
-- and PayPal keys from the admin panel. It was removed on purpose: a hijacked
-- admin session could have swapped in an attacker's PayPal credentials and
-- silently redirected every payment. Those keys now come from environment
-- variables only, so changing one takes a deploy — the right amount of
-- friction for credentials that receive money.
--
-- If you already ran an older version of this file, the leftover table is
-- harmless (nothing reads it), but you can drop it:
--   drop table if exists public.managed_secrets;

-- Blog posts — was a hardcoded array in lib/data.ts; now editable from
-- /admin/blog. Public read only for published posts; all writes go through
-- the service-role-driven /api/admin/blog route.
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null,
  content text not null,             -- markdown
  tag text not null,
  cover_image_url text,
  read_mins int not null default 5,
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  author_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.blog_posts enable row level security;
drop policy if exists "anyone can read published posts" on public.blog_posts;
create policy "anyone can read published posts" on public.blog_posts
  for select using (status = 'published');
-- drafts are only visible via the service-role admin API, and all writes
-- (including publishing) go through that same server-side path

drop trigger if exists blog_posts_touch_updated_at on public.blog_posts;
create trigger blog_posts_touch_updated_at
  before update on public.blog_posts
  for each row execute function public.touch_updated_at();

-- Public storage bucket for admin-uploaded assets (the site logo, for now).
-- Public READ (the logo needs to load for every visitor), writes restricted
-- to the service role only — matches every other admin-write table above.
insert into storage.buckets (id, name, public)
values ('public-assets', 'public-assets', true)
on conflict (id) do nothing;

-- storage.objects already has RLS enabled by Supabase by default; add just
-- the public-read policy for this bucket. No insert/update/delete policy for
-- authenticated/anon roles = only the service role can write into it.
drop policy if exists "public read of public-assets" on storage.objects;
create policy "public read of public-assets"
  on storage.objects for select
  using (bucket_id = 'public-assets');

-- Migrate the 3 posts that used to be hardcoded in lib/data.ts, so nothing
-- is lost when the site switches from the static array to this table. Body
-- content was never written for these (the old detail page rendered literal
-- placeholder text) — seeded here as short drafts to finish in /admin/blog,
-- not as finished articles.
insert into public.blog_posts (slug, title, excerpt, content, tag, read_mins, status, published_at)
values
  (
    'best-free-chatgpt-alternative-2026',
    'The best free ChatGPT alternative in 2026, tested',
    'No account, no card, no cap — we compared the free multi-model chat tools worth your time this year.',
    E'No account, no card, no cap — we compared the free multi-model chat tools worth your time this year.\n\n_This post is a migrated draft — finish it in /admin/blog._',
    'Comparisons', 6, 'published', '2026-07-12T00:00:00Z'
  ),
  (
    'chatgpt-vs-gemini-vs-deepseek',
    'ChatGPT vs Gemini vs Deepseek: which one for which task',
    'A practical breakdown of where each model actually wins — writing, research, and code.',
    E'A practical breakdown of where each model actually wins — writing, research, and code.\n\n_This post is a migrated draft — finish it in /admin/blog._',
    'Guides', 5, 'published', '2026-06-28T00:00:00Z'
  ),
  (
    'ai-image-generator-no-signup',
    'Generating AI images without signing up — what actually works',
    'A short field guide to free image generation, and what "free" quietly costs elsewhere.',
    E'A short field guide to free image generation, and what "free" quietly costs elsewhere.\n\n_This post is a migrated draft — finish it in /admin/blog._',
    'Guides', 4, 'published', '2026-06-14T00:00:00Z'
  )
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Admin-adjustable plan limits (credits/price), margin-checked before write
-- ---------------------------------------------------------------------------
-- id: 'guest' | 'free' (free daily allowance, price null) or
--     'starter' | 'pro' | 'promax' (paid monthly package, price required)
create table if not exists public.plan_limits (
  id text primary key,
  credits bigint not null check (credits > 0),
  price numeric(10,2),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.plan_limits enable row level security;
drop policy if exists "anyone can read plan limits" on public.plan_limits;
create policy "anyone can read plan limits" on public.plan_limits for select using (true);
-- no insert/update/delete policy = no client writes; only the service-role
-- driven /api/admin/limits route (which margin-checks every write) can change these

-- ---------------------------------------------------------------------------
-- Historical prices per package — the reason /admin/limits needs this:
-- PayPal subscription plans are locked to the price a subscriber signed up
-- at (see lib/paypal.ts's ensurePlanId — each price gets its own plan), so
-- raising a package's credits does not just affect new subscribers at the
-- new price; it ALSO immediately raises the credits for every subscriber
-- still on an OLDER, lower price via a legacy PayPal plan. The margin check
-- alone (new price vs new credits) never sees that combination. This table
-- is what lets /api/admin/limits check new credits against every price ever
-- actually charged for the package, not just the one being saved right now.
create table if not exists public.plan_limit_history (
  id uuid primary key default gen_random_uuid(),
  package_id text not null,
  price numeric(10,2) not null,
  recorded_at timestamptz not null default now()
);
alter table public.plan_limit_history enable row level security;
-- no policies at all = service-role only; this is an internal safety-check
-- data source, never read or written by anything the browser calls directly

-- ---------------------------------------------------------------------------
-- Showcase clips
--
-- Hand-picked examples shown to visitors on the video generator, so someone
-- landing cold sees what the tool produces before spending anything. Tapping
-- one reuses its prompt, which is the point: the gallery is a starting place,
-- not decoration.
--
-- Portrait (9:16) by choice — it is the shape that reads on a phone, where
-- most of this traffic arrives, and a row of tall cards shows more examples
-- per screen than landscape ones.
--
-- Curated rather than automatic: these are the site's own marketing, so an
-- admin picks them. Reads are public; only the service role writes.
-- ---------------------------------------------------------------------------
create table if not exists public.showcase_clips (
  id uuid primary key default gen_random_uuid(),
  video_url text not null,
  poster_url text,                    -- optional still, so the grid isn't blank before play
  prompt text not null,               -- reused when a visitor taps the clip
  model_name text,
  aspect text not null default '9:16',
  sort_order int not null default 0,  -- lower first, so ordering is deliberate
  published boolean not null default true,
  created_at timestamptz not null default now()
);
/*
 * Added later, so these are ALTERs rather than columns above — an existing
 * project must be able to run this file again without losing its rows.
 *
 * surface   which studio the item belongs to. The video generator and the
 *           image generator each have their own gallery, and they must not
 *           show each other's media.
 * in_guess  also show it on that studio's "Guess" tab. One list with a tick
 *           rather than a second table: the same clip is usually wanted in
 *           both places, and two tables would mean uploading it twice.
 *
 * video_url holds the media URL for both surfaces — it predates images and is
 * kept rather than renamed so existing rows and any external reference keep
 * working. Read it as "media_url".
 */
alter table public.showcase_clips add column if not exists surface text not null default 'video';
alter table public.showcase_clips add column if not exists in_guess boolean not null default false;

do $$ begin
  alter table public.showcase_clips
    add constraint showcase_clips_surface_check check (surface in ('video','image'));
exception when duplicate_object then null; end $$;

create index if not exists showcase_clips_surface_idx
  on public.showcase_clips (surface, published, sort_order);

alter table public.showcase_clips enable row level security;

drop policy if exists "public read published showcase" on public.showcase_clips;
create policy "public read published showcase"
  on public.showcase_clips for select
  using (published = true);

-- ---------------------------------------------------------------------------
-- Projects
--
-- These were browser-only, which is defensible for chats — they are cheap to
-- start again — but not for a paid feature someone has invested in writing.
-- Clearing site data or opening the site on a phone should not lose work a
-- subscriber is paying to keep.
--
-- Owned by the signing-in user and readable only by them: a project brief
-- routinely contains client names, internal stack details and unreleased
-- plans, so RLS scopes every row to its owner rather than relying on the
-- application to filter correctly.
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text not null default '📁',
  brief text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_user_idx on public.projects (user_id, updated_at desc);
alter table public.projects enable row level security;

drop policy if exists "own projects select" on public.projects;
create policy "own projects select" on public.projects
  for select using (auth.uid() = user_id);

drop policy if exists "own projects insert" on public.projects;
create policy "own projects insert" on public.projects
  for insert with check (auth.uid() = user_id);

drop policy if exists "own projects update" on public.projects;
create policy "own projects update" on public.projects
  for update using (auth.uid() = user_id);

drop policy if exists "own projects delete" on public.projects;
create policy "own projects delete" on public.projects
  for delete using (auth.uid() = user_id);

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- STUDIO PROJECTS (image / video / audio / speech generators)
--
-- The studios group every generation into a "project": a title, a timestamp
-- and an ordered list of clips. The browser is the primary store (guests get
-- localStorage and nothing else), but a signed-in account is the source of
-- truth across devices, so the whole list is mirrored here as one JSON blob
-- per (user, kind). One row per kind keeps the write path a single upsert —
-- the client debounces and pushes the entire list, exactly as the WordPress
-- studio did with user meta.
-- ---------------------------------------------------------------------------
create table if not exists public.studio_projects (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                       -- 'image' | 'video' | 'audio' | 'speech'
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);
create index if not exists studio_projects_user_idx on public.studio_projects (user_id, updated_at desc);
alter table public.studio_projects enable row level security;

drop policy if exists "own studio projects select" on public.studio_projects;
create policy "own studio projects select" on public.studio_projects
  for select using (auth.uid() = user_id);

drop policy if exists "own studio projects insert" on public.studio_projects;
create policy "own studio projects insert" on public.studio_projects
  for insert with check (auth.uid() = user_id);

drop policy if exists "own studio projects update" on public.studio_projects;
create policy "own studio projects update" on public.studio_projects
  for update using (auth.uid() = user_id);

drop policy if exists "own studio projects delete" on public.studio_projects;
create policy "own studio projects delete" on public.studio_projects
  for delete using (auth.uid() = user_id);

drop trigger if exists studio_projects_touch_updated_at on public.studio_projects;
create trigger studio_projects_touch_updated_at
  before update on public.studio_projects
  for each row execute function public.touch_updated_at();
