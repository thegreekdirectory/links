import { createClient } from '@supabase/supabase-js';

export async function onRequest(context) {
  const { request, env, ctx } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // 1. RULE: Admin Bypass
  if (path.startsWith('/admin/')) return context.next();

  // 2. RULE: Root Bypass
  if ((path === '/' || path === '/index.html') && url.searchParams.get('redirect') === 'false') {
    return context.next();
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  let destination = null;
  let status = 302;

  try {
    // 3. RULE: Handle /go/*
    if (path.startsWith('/go/')) {
      const remainingPath = path.replace('/go/', '');
      destination = `https://thegreekdirectory.org/${remainingPath}${url.search}${url.hash}`;
      status = 301;
    } 
    // 4. RULE: Supabase Lookup (Removed .single() to prevent crash on 404)
    else if (path !== '/' && path !== '/index.html') {
      const { data, error } = await supabase
        .from('shortlinks')
        .select('redirect_to')
        .eq('path', path)
        .limit(1); // Use limit instead of single for safety
      
      if (data && data.length > 0) {
        destination = data[0].redirect_to;
      }
    }

    // --- ANALYTICS LOGIC ---
    if (destination) {
      const logAnalytics = async () => {
        try {
          // Fallback to empty strings if CF headers are missing to prevent 1101
          const cf = request.cf || {}; 
          await supabase.from('shortlink_events').insert({
            path: path,
            redirect_url: destination,
            user_agent: request.headers.get('user-agent') || 'Unknown',
            ip: request.headers.get('cf-connecting-ip') || '0.0.0.0',
            city: cf.city || 'Unknown',
            region: cf.region || 'Unknown',
            country: cf.country || 'Unknown',
            latitude: cf.latitude || 0,
            longitude: cf.longitude || 0,
            timezone: cf.timezone || 'UTC',
            event_time: new Date().toISOString()
          });
        } catch (e) {
          console.error("Analytics Background Error:", e);
        }
      };

      ctx.waitUntil(logAnalytics());

      return new Response(null, {
        status: status,
        headers: { 
          'Location': destination, 
          'X-Robots-Tag': 'noindex' 
        },
      });
    }
  } catch (globalError) {
    // This prevents the 1101 error page from showing; 
    // it will just fall through to your 404.html/index.html instead.
    console.error("Worker Global Error:", globalError);
  }

  // 5. Fallback: If no destination found OR code crashed, show repo files
  return context.next();
}
