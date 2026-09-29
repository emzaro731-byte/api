const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ error: "OPENAI_API_KEY is not configured" }, 500);
  try {
    const body = await req.json();
    if (typeof body?.prompt !== "string" || !body.prompt.trim()) return json({ error: "prompt is required" }, 400);
    const form = new FormData();
    form.append("model", body?.model ?? "sora-2");
    form.append("prompt", body.prompt.trim());
    form.append("seconds", String([4, 8, 12].includes(Number(body?.seconds)) ? Number(body.seconds) : 8));
    form.append("size", body?.size ?? "720x1280");
    const upstream = await fetch("https://api.openai.com/v1/videos", { method: "POST", headers: { Authorization: "Bearer " + key }, body: form });
    const data = await upstream.json();
    if (!upstream.ok) return json({ error: data?.error?.message ?? "Video generation failed", details: data }, upstream.status);
    return json(data, 202);
  } catch { return json({ error: "Invalid request or server error" }, 500); }
});