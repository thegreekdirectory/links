export async function onRequest(context) {
  const { request, env, ctx } = context;
  const url  = new URL(request.url);
  const path = url.pathname;

  // ── 1. ADMIN BYPASS ──────────────────────────────────────────────────────
  if (path.startsWith('/admin/')) return context.next();

  // ── 2. ROOT BYPASS  (tgd.gr/?redirect=false) ─────────────────────────────
  if (
    (path === '/' || path === '/index.html') &&
    url.searchParams.get('redirect') === 'false'
  ) {
    return context.next();
  }

  // ── 3. /go/ PROXY (301) — no Supabase needed, handle before env guard ─────
  if (path.startsWith('/go/')) {
    const rest = path.slice('/go/'.length);
    const destination = `https://thegreekdirectory.org/${rest}${url.search}`;
    logAnalytics(ctx, env, path, destination, request);
    return new Response(null, {
      status: 301,
      headers: {
        Location:        destination,
        'X-Robots-Tag':  'noindex',
        'Cache-Control': 'no-store',
      },
    });
  }

  // ── Guard: if env vars are missing, skip Supabase logic entirely ──────────
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    console.error('[worker] SUPABASE_URL or SUPABASE_KEY env var is not set');
    return context.next();
  }

  // ── 4. SUPABASE LOOKUP (302) ─────────────────────────────────────────────
  if (path !== '/' && path !== '/index.html') {
    try {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/shortlinks` +
          `?select=redirect_to&path=eq.${encodeURIComponent(path)}&limit=1`,
        {
          headers: {
            apikey:        env.SUPABASE_KEY,
            Authorization: `Bearer ${env.SUPABASE_KEY}`,
          },
        }
      );

      if (res.ok) {
        const rows = await res.json();
        if (rows.length > 0 && rows[0].redirect_to) {
          const destination = rows[0].redirect_to;
          logAnalytics(ctx, env, path, destination, request);
          return new Response(null, {
            status: 302,
            headers: {
              Location:        destination,
              'X-Robots-Tag':  'noindex',
              'Cache-Control': 'no-store',
            },
          });
        }
      } else {
        console.error('[supabase] lookup failed:', res.status, await res.text());
      }
    } catch (err) {
      console.error('[supabase] fetch error:', err);
    }
  }

  // ── 5. FALLBACK → serve repo file (custom 404 etc.) ──────────────────────
  return context.next();
}

// ── Fire-and-forget analytics — never throws, never blocks the redirect ──────
function logAnalytics(ctx, env, path, destination, request) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return;
  try {
    ctx.waitUntil(
      fetch(`${env.SUPABASE_URL}/rest/v1/shortlink_events`, {
        method: 'POST',
        headers: {
          apikey:         env.SUPABASE_KEY,
          Authorization:  `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer:         'return=minimal',
        },
        body: JSON.stringify({
          path,
          redirect_url: destination,
          user_agent:   request.headers.get('user-agent'),
          ip:           request.headers.get('cf-connecting-ip'),
          city:         request.cf?.city      ?? null,
          region:       request.cf?.region    ?? null,
          country:      request.cf?.country   ?? null,
          latitude:     request.cf?.latitude  != null ? parseFloat(request.cf.latitude)  : null,
          longitude:    request.cf?.longitude != null ? parseFloat(request.cf.longitude) : null,
          timezone:     request.cf?.timezone  ?? null,
          event_time:   new Date().toISOString(),
        }),
      }).catch(err => console.error('[analytics] insert error:', err))
    );
  } catch (err) {
    console.error('[analytics] waitUntil error:', err);
  }
}
