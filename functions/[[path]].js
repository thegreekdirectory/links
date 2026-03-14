import { createClient } from '@supabase/supabase-js';

export async function onRequest(context) {
  const { request, env, ctx } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // 1. RULE: Admin Bypass
  if (path.startsWith('/admin/')) return context.next();

  // 2. RULE: Root Bypass (tgd.gr/?redirect=false)
  if ((path === '/' || path === '/index.html') && url.searchParams.get('redirect') === 'false') {
    return context.next();
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  let destination = null;
  let status = 302;

  // 3. RULE: Handle /go/* (301 Proxy)
  if (path.startsWith('/go/')) {
    const remainingPath = path.replace('/go/', '');
    destination = `https://thegreekdirectory.org/${remainingPath}${url.search}${url.hash}`;
    status = 301;
  } 
  // 4. RULE: Supabase Lookup (Keep slash to match your DB entries)
  else if (path !== '/' && path !== '/index.html') {
    const { data } = await supabase
      .from('shortlinks')
      .select('redirect_to')
      .eq('path', path)
      .single();
    
    if (data?.redirect_to) destination = data.redirect_to;
  }

  // --- ANALYTICS LOGIC ---
  if (destination) {
    const logAnalytics = async () => {
      try {
        await supabase.from('shortlink_events').insert({
          path: path,
          redirect_url: destination,
          user_agent: request.headers.get('user-agent'),
          ip: request.headers.get('cf-connecting-ip'), // Get IP from Cloudflare header
          city: request.cf?.city || 'Unknown',
          region: request.cf?.region || 'Unknown',
          country: request.cf?.country || 'Unknown',
          latitude: request.cf?.latitude,
          longitude: request.cf?.longitude,
          timezone: request.cf?.timezone || 'Unknown',
          event_time: new Date().toISOString()
        });
      } catch (e) {
        console.error("Analytics Error:", e);
      }
    };

    // Background task: doesn't block the user's redirect
    ctx.waitUntil(logAnalytics());

    return new Response(null, {
      status: status,
      headers: { 
        'Location': destination, 
        'X-Robots-Tag': 'noindex' 
      },
    });
  }

  // 5. Fallback to Repo (allows the 5s timer on index.html or your custom 404.html)
  return context.next();
}
