import { createClient } from '@supabase/supabase-js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const searchParams = url.searchParams;

  // 1. RULE: Allow /admin/ to pass through to the repo files
  if (path.startsWith('/admin/')) {
    return context.next();
  }

  // 2. RULE: Handle Root (/) with ?redirect=false logic
  if (path === '/' || path === '/index.html' || path === '/index') {
    if (searchParams.get('redirect') === 'false') {
      return context.next();
    }
  }

  // 3. RULE: Handle /go/* (Proxy-style 301 redirect)
  if (path.startsWith('/go/')) {
    const remainingPath = path.replace('/go/', '');
    const destination = `https://thegreekdirectory.org/${remainingPath}${url.search}${url.hash}`;
    
    return new Response(null, {
      status: 301,
      headers: {
        'Location': destination,
        'X-Robots-Tag': 'noindex', // Prevent bots from indexing these
      },
    });
  }

  // 4. RULE: Supabase Dynamic Redirects
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  
  // FIX: Keep the original path (including the slash) to match what is saved in Supabase
  const slug = path; 

  if (slug && slug !== '/') { // Prevent unnecessary DB lookups for the homepage
    const { data, error } = await supabase
      .from('shortlinks')
      .select('redirect_to')
      .eq('path', slug)
      .single();

    if (data && data.redirect_to) {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': data.redirect_to,
          'X-Robots-Tag': 'noindex',
        },
      });
    }
  }

  // 5. RULE: Fallback to Repo (allows custom 404 from Pages to show)
  return context.next();
}
