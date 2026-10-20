export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowOrigins = new Set([
      'http://localhost:3000',
      'https://rollinn.netlify.app',
      'https://geetakalp.onrender.com'
    ]);
    const allowedOrigin = allowOrigins.has(origin) ? origin : '';

    const requestHeaders = request.headers.get('Access-Control-Request-Headers');
    const cors = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "POST, PUT, GET, OPTIONS",
      "Access-Control-Allow-Headers": requestHeaders || "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    if (request.method === "POST") {
      const body = await request.json();
      const userId = body.userId || "user";
      const ext = (body.fileName || "photo.jpg").split('.').pop() || "jpg";
      const key = `profile-photos/${userId}/${Date.now()}.${ext}`;

      const uploadUrl = `${url.origin}${url.pathname}?key=${encodeURIComponent(key)}&contentType=${encodeURIComponent(body.contentType || 'application/octet-stream')}`;
      const publicUrl = `${url.origin}/file/${key}`;

      return new Response(JSON.stringify({ uploadUrl, key, publicUrl }), {
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    if (request.method === "PUT") {
      const key = url.searchParams.get('key');
      if (!key) {
        return new Response("Missing key", { status: 400, headers: cors });
      }

      const contentType =
        url.searchParams.get('contentType') ||
        request.headers.get("Content-Type") ||
        "application/octet-stream";

      await env.PROFILE_PHOTOS.put(key, request.body, {
        httpMetadata: { contentType }
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    if (request.method === "GET") {
      const key = url.pathname.startsWith('/file/')
        ? url.pathname.slice('/file/'.length)
        : url.searchParams.get('key');

      if (!key) {
        return new Response("Missing key", { status: 400, headers: cors });
      }

      const object = await env.PROFILE_PHOTOS.get(key);
      if (!object) {
        return new Response("Not found", { status: 404, headers: cors });
      }

      const headers = new Headers(cors);
      headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
      headers.set("Cache-Control", "public, max-age=31536000, immutable");

      return new Response(object.body, { headers });
    }

    return new Response("Not found", { status: 404, headers: cors });
  }
};
