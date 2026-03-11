(() => {
  const script = document.currentScript;
  const redirectUrl = script?.dataset.redirect
    || document.querySelector('meta[name="shortlink-redirect"]')?.content;

  if (!redirectUrl) {
    return;
  }

  const SUPABASE_URL = "https://luetekzqrrgdxtopzvqw.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1ZXRla3pxcnJnZHh0b3B6dnF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNDc2NDcsImV4cCI6MjA4MzkyMzY0N30.TIrNG8VGumEJc_9JvNHW-Q-UWfUGpPxR0v8POjWZJYg";
  const ANALYTICS_TABLE = "shortlink_events";
  const ANALYTICS_ENDPOINT = `${SUPABASE_URL}/rest/v1/${ANALYTICS_TABLE}`;

  const payload = {
    path: window.location.pathname,
    redirect_url: redirectUrl,
    user_agent: navigator.userAgent,
    event_time: new Date().toISOString()
  };

  const fetchGeo = async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 200);
      const response = await fetch("https://ipapi.co/json/", {
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      return null;
    }
  };

  const sendEvent = async () => {
    const geo = await fetchGeo();
    if (geo) {
      payload.ip = geo.ip;
      payload.city = geo.city;
      payload.region = geo.region;
      payload.country = geo.country_name || geo.country;
      payload.latitude = geo.latitude;
      payload.longitude = geo.longitude;
      payload.timezone = geo.timezone;
    }

    try {
      await fetch(ANALYTICS_ENDPOINT, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify(payload),
        keepalive: true
      });
    } catch (error) {
      // Swallow analytics errors to avoid blocking redirects.
    }
  };

  void sendEvent();
  setTimeout(() => {
    window.location.replace(redirectUrl);
  }, 200);
})();
