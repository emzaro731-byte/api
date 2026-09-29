import express from "express";

const app = express();
app.use(express.json({ limit: "8mb" }));

const PORT = Number(process.env.GROK_PORT || 10001);
const XAI = "https://api.x.ai/v1";
const MODEL = process.env.GROK_MODEL || "grok-4.7";

function auth(req, res, next) {
  const expected = process.env.VEYLOLA_API_KEY;
  if (expected) {
    const got = req.get("x-veylola-api-key") || req.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (got !== expected) return res.status(401).json({ error: "Invalid Veylola API key" });
  }
  next();
}

async function call(path, body) {
  if (!process.env.XAI_API_KEY) throw new Error("XAI_API_KEY is not configured");
  return fetch(XAI + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function json(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function tools(body) {
  const out = [];
  if (body.web_search !== false) out.push({ type: "web_search" });
  if (body.x_search) out.push({ type: "x_search", ...(body.x_image_understanding ? { enable_image_understanding: true } : {}), ...(body.x_video_understanding ? { enable_video_understanding: true } : {}) });
  if (body.code_execution) out.push({ type: "code_interpreter" });
  if (body.image_generation) out.push({ type: "image_generation" });
  if (body.vector_store_ids?.length) out.push({ type: "file_search", vector_store_ids: body.vector_store_ids });
  return out;
}

app.use(auth);

app.get("/", (_req, res) => res.json({
  name: "Veylola Grok Gateway",
  status: "ok",
  model: MODEL,
  capabilities: ["chat","reasoning","web_search","x_search","code_execution","image_generation","file_search","citations"]
}));

app.get("/health", (_req, res) => res.json({ status: "healthy", provider: "xAI", model: MODEL }));

app.post("/v1/grok/responses", async (req, res) => {
  const body = req.body || {};
  const input = body.input ?? body.message;
  if (!input) return res.status(400).json({ error: "input or message is required" });

  try {
    const upstream = await call("/responses", {
      model: body.model || MODEL,
      input,
      ...(body.instructions ? { instructions: body.instructions } : {}),
      ...(body.previous_response_id ? { previous_response_id: body.previous_response_id } : {}),
      ...(body.reasoning_effort ? { reasoning_effort: body.reasoning_effort } : {}),
      ...(body.prompt_cache_key ? { prompt_cache_key: body.prompt_cache_key } : {}),
      tools: tools(body),
      ...(body.stream ? { stream: true } : {})
    });

    if (body.stream) {
      res.status(upstream.status);
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/event-stream");
      if (upstream.body) {
        const reader = upstream.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
      }
      return res.end();
    }

    const data = await json(upstream);
    if (!upstream.ok) return res.status(upstream.status).json({ error: "Grok request failed", details: data });
    return res.json({
      id: data.id,
      model: data.model || MODEL,
      response: data.output_text || "",
      output: data.output || [],
      citations: data.citations || [],
      usage: data.usage || null,
      status: data.status || "completed"
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Grok request failed" });
  }
});

app.post("/grok/image", async (req, res) => {
  try {
    const upstream = await call("/images/generations", {
      model: req.body.model || "grok-imagine-image-2.0",
      prompt: req.body.prompt,
      ...(req.body.aspect_ratio ? { aspect_ratio: req.body.aspect_ratio } : {})
    });
    const data = await json(upstream);
    return res.status(upstream.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/grok/video", async (req, res) => {
  try {
    const upstream = await call("/videos/generations", {
      model: req.body.model || "grok-imagine-video-1.5",
      prompt: req.body.prompt,
      ...(req.body.resolution ? { resolution: req.body.resolution } : {}),
      ...(req.body.aspect_ratio ? { aspect_ratio: req.body.aspect_ratio } : {}),
      ...(req.body.generate_audio !== undefined ? { generate_audio: Boolean(req.body.generate_audio) } : {})
    });
    const data = await json(upstream);
    return res.status(upstream.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/grok/tts", async (req, res) => {
  try {
    const upstream = await call("/tts", {
      text: req.body.text,
      voice_id: req.body.voice_id || "eve",
      language: req.body.language || "en"
    });
    const data = await json(upstream);
    return res.status(upstream.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Veylola Grok gateway listening on ${PORT}`));
