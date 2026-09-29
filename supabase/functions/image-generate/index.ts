const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

const enhancePrompt = (prompt: string, body: any) => {
  const style = typeof body?.style === "string" ? body.style : "photorealistic cinematic";
  const lighting = typeof body?.lighting === "string" ? body.lighting : "natural physically plausible lighting";
  const camera = typeof body?.camera === "string" ? body.camera : "professional full-frame camera, realistic lens depth of field";
  return [prompt.trim(), "Visual direction: " + style + ".", "Lighting: " + lighting + ".", "Camera: " + camera + ".", "Prioritize natural anatomy, realistic skin and material texture, physically plausible shadows and reflections, subtle imperfections, coherent perspective, accurate depth of field, and believable environmental detail.", "Avoid plastic-looking skin, excessive sharpening, warped anatomy, duplicate objects, unnatural symmetry, artificial HDR, and obvious rendering artifacts."].join(" ");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ error: "OPENAI_API_KEY is not configured" }, 500);
  try {
    const body = await req.json();
    if (typeof body?.prompt !== "string" || !body.prompt.trim()) return json({ error: "prompt is required" }, 400);
    const upstream = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ model: body?.model ?? "gpt-image-2", prompt: enhancePrompt(body.prompt, body), size: body?.size ?? "1024x1024", quality: body?.quality ?? "high", n: Math.min(Math.max(Number(body?.n ?? 1), 1), 4), background: body?.background ?? "auto" }),
    });
    const data = await upstream.json();
    if (!upstream.ok) return json({ error: data?.error?.message ?? "Image generation failed" }, upstream.status);
    return json({ data: data.data ?? [], model: body?.model ?? "gpt-image-2", quality: body?.quality ?? "high" });
  } catch { return json({ error: "Invalid request or server error" }, 500); }
});