const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const base = Deno.env.get("VIDEO_API_URL");
  const key = Deno.env.get("VIDEO_API_KEY");
  if (!base || !key) {
    return json({ error: "VIDEO_API_URL and VIDEO_API_KEY must be configured" }, 500);
  }

  try {
    const body = await req.json();
    if (typeof body?.prompt !== "string" || !body.prompt.trim()) {
      return json({ error: "prompt is required" }, 400);
    }

    // Provider-agnostic adapter: configure your video provider's create-job endpoint.
    const upstream = await fetch(base, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();
    if (!upstream.ok) return json({ error: data?.error?.message ?? "Video generation failed", details: data }, upstream.status);
    return json(data, 202);
  } catch {
    return json({ error: "Invalid request or server error" }, 500);
  }
});
