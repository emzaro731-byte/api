import express from "express";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

const PORT = Number(process.env.PORT || 10000);
const AI_MODEL = process.env.AI_MODEL || "gpt-5.6";
const fail = (res, status, error, details) => res.status(status).json({ error, ...(details ? { details } : {}) });

app.get("/", (_req, res) => res.json({ name: "Veylola AI API", status: "ok", model: AI_MODEL }));
app.get("/health", (_req, res) => res.json({ status: "healthy" }));

app.post("/chat", async (req, res) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return fail(res, 500, "OPENAI_API_KEY is not configured");
  const { message, previous_response_id } = req.body ?? {};
  if (typeof message !== "string" || !message.trim()) return fail(res, 400, "message must be a non-empty string");
  const payload = {
    model: AI_MODEL,
    input: [
      { role: "developer", content: "You are Veylola AI, a capable general-purpose AI assistant. Be accurate, helpful, clear and honest about limitations." },
      { role: "user", content: message.trim() }
    ],
    store: true
  };
  if (typeof previous_response_id === "string" && previous_response_id.trim()) payload.previous_response_id = previous_response_id.trim();
  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await upstream.json();
    if (!upstream.ok) return fail(res, upstream.status, "AI provider request failed", data?.error?.message || "Unknown provider error");
    return res.json({ id: data.id, response: data.output_text || "", model: data.model || AI_MODEL });
  } catch (e) {
    console.error(e);
    return fail(res, 500, "Server error");
  }
});

app.post("/image", async (req, res) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return fail(res, 500, "OPENAI_API_KEY is not configured");
  const { prompt, model = "gpt-image-2", size = "1024x1024", quality = "high", n = 1 } = req.body ?? {};
  if (typeof prompt !== "string" || !prompt.trim()) return fail(res, 400, "prompt is required");
  try {
    const upstream = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: prompt.trim(), size, quality, n: Math.min(Math.max(Number(n) || 1, 1), 4) })
    });
    const data = await upstream.json();
    if (!upstream.ok) return fail(res, upstream.status, "Image generation failed", data?.error?.message);
    return res.json({ data: data.data || [], model, quality });
  } catch (e) {
    console.error(e);
    return fail(res, 500, "Server error");
  }
});

app.post("/video", async (req, res) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return fail(res, 500, "OPENAI_API_KEY is not configured");
  const { prompt, model = "sora-2", seconds = 8, size = "720x1280" } = req.body ?? {};
  if (typeof prompt !== "string" || !prompt.trim()) return fail(res, 400, "prompt is required");
  const validSeconds = [4, 8, 12].includes(Number(seconds)) ? Number(seconds) : 8;
  try {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt.trim());
    form.append("seconds", String(validSeconds));
    form.append("size", size);
    const upstream = await fetch("https://api.openai.com/v1/videos", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
    const data = await upstream.json();
    if (!upstream.ok) return fail(res, upstream.status, "Video generation failed", data?.error?.message);
    return res.status(202).json(data);
  } catch (e) {
    console.error(e);
    return fail(res, 500, "Server error");
  }
});

app.post("/music", async (req, res) => {
  const base = process.env.MUSIC_API_URL, key = process.env.MUSIC_API_KEY;
  if (!base || !key) return fail(res, 500, "MUSIC_API_URL and MUSIC_API_KEY must be configured");
  if (typeof req.body?.prompt !== "string" || !req.body.prompt.trim()) return fail(res, 400, "prompt is required");
  try {
    const upstream = await fetch(base, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    const data = await upstream.json();
    if (!upstream.ok) return fail(res, upstream.status, "Music generation failed", data?.error?.message);
    return res.status(202).json(data);
  } catch (e) {
    console.error(e);
    return fail(res, 500, "Server error");
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Veylola AI API listening on ${PORT}`));
