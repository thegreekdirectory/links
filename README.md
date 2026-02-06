# Shortlink Analytics (Supabase)

This repo now ships a lightweight analytics pipeline that logs every redirect event to Supabase and shows an aggregated summary in the admin UI.

## Supabase setup

Create a table for events (and optional summary view) in your Supabase SQL editor:

```sql
create table if not exists public.shortlink_events (
  id bigint generated always as identity primary key,
  path text not null,
  redirect_url text not null,
  user_agent text,
  ip text,
  city text,
  region text,
  country text,
  latitude numeric,
  longitude numeric,
  timezone text,
  event_time timestamptz not null default now()
);

alter table public.shortlink_events enable row level security;

create policy "Allow anon inserts" on public.shortlink_events
  for insert
  to anon
  with check (true);

create policy "Allow anon reads" on public.shortlink_events
  for select
  to anon
  using (true);

create or replace view public.shortlink_event_summary as
  select
    path,
    count(*) as total_events,
    max(event_time) as last_seen
  from public.shortlink_events
  group by path;
```

> Note: The admin UI reads aggregated data using the anon key, so the read policy above is required. If you prefer stricter access, replace the read policy with a service role proxy and update the admin UI to call it.

## What gets logged

Each redirect page captures:

- `path` (shortlink path)
- `redirect_url`
- `user_agent`
- `event_time`
- `ip`, `city`, `region`, `country`, `latitude`, `longitude`, `timezone` (from IP geolocation)

All logging happens in `analytics.js`, which runs on every redirect page before the navigation completes.
