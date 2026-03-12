import { createClient } from '@supabase/supabase-js'

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const slug = url.pathname.split('/').pop(); // Gets 'xyz' from tgd.gr/xyz

    if (!slug) {
      return Response.redirect("https://thegreekdirectory.gr", 302); // Fallback to main site
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    const { data } = await supabase.from('links').select('url').eq('slug', slug).single();

    if (data?.url) {
      return Response.redirect(data.url, 301);
    }

    // Custom 404 if link is missing
    return new Response("Link not found on tgd.gr", { status: 404 });
  }
}
