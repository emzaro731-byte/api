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

  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ error: "OPENAI_API_KEY is not configured" }, 500);

  try {
    const body = await req.json();
    const prompt = body?.prompt;
    if (typeof prompt !== "string" || !prompt.trim()) {
      return json({ error: "prompt is required" }, 400);
    }

    const upstream = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: body?.model ?? "gpt-image-1",
        prompt: prompt.trim(),
        size: body?.size ?? "1024x1024",
        quality: body?.quality ?? "auto",
        n: Math.min(Math.max(Number(body?.n ?? 1), 1), 4),
      }),
    });

    const data = await upstream.json();
    if (!upstream.ok) return json({ error: data?.error?.message ?? "Image generation failed" }, upstream.status);
    return json({ data: data.data ?? [] });
  } catch {
    return json({ error: "Invalid request or server error" }, 500);
  }
});
