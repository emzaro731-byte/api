import express from "express";
import multer from "multer";
import crypto from "node:crypto";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization, x-veylola-api-key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

const PORT = Number(process.env.PORT || 10000);
const AI_PROVIDER = (process.env.AI_PROVIDER || "auto").toLowerCase();
const AI_MODEL = process.env.AI_MODEL || "llama3.2";
const LOCAL_AI_URL = (process.env.LOCAL_AI_URL || "http://127.0.0.1:11434/v1").replace(/\/$/, "");
const LOCAL_IMAGE_URL = process.env.LOCAL_IMAGE_URL || "";
const LOCAL_VIDEO_URL = process.env.LOCAL_VIDEO_URL || "";
const LOCAL_MUSIC_URL = process.env.LOCAL_MUSIC_URL || "";
const OPENAI_URL = "https://api.openai.com/v1";
const startedAt = Date.now();
const rateBuckets = new Map();

function fail(res, status, error, details) {
  return res.status(status).json({ error, ...(details ? { details } : {}) });
}

function getClientKey(req) {
  return req.get("x-veylola-api-key") || req.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
}

function guard(req, res, next) {
  const configured = process.env.VEYLOLA_API_KEY;
  if (configured && getClientKey(req) !== configured) {
    return fail(res, 401, "Invalid Veylola API key");
  }

  const key = configured ? getClientKey(req) : (req.ip || "anonymous");
  const now = Date.now();
  const windowMs = 60_000;
  const limit = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 0);
  // 0 disables Veylola's app-side request cap. Provider limits still apply.
  if (limit <= 0) return next();
  const bucket = rateBuckets.get(key) || { start: now, count: 0 };
  if (now - bucket.start >= windowMs) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > limit) {
    res.setHeader("Retry-After", "60");
    return fail(res, 429, "Rate limit exceeded");
  }
  next();
}

app.use(guard);

async function fetchWithRetry(url, options = {}, attempts = 4) {
  let lastResponse;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(url, options);
    if (response.status !== 429 || attempt === attempts - 1) return response;
    lastResponse = response;
    const retryAfter = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 30000)
      : Math.min(1000 * (2 ** attempt), 8000);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  return lastResponse;
}

async function localAI(path, options = {}) {
  return fetchWithRetry(LOCAL_AI_URL + path, options);
}

function useLocalAI() {
  if (AI_PROVIDER === "local") return true;
  if (AI_PROVIDER === "openai") return false;
  return Boolean(process.env.LOCAL_AI_URL);
}

function localMessages(input) {
  if (typeof input === "string") return [{ role: "user", content: input }];
  if (!Array.isArray(input)) return [{ role: "user", content: String(input ?? "") }];
  const text = input.map(item => {
    if (typeof item === "string") return item;
    if (item?.content) return typeof item.content === "string" ? item.content : JSON.stringify(item.content);
    return JSON.stringify(item);
  }).join("\n");
  return [{ role: "user", content: text }];
}

async function openai(path, options = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Object.assign(new Error("OPENAI_API_KEY is not configured"), { status: 500 });
  return fetchWithRetry(OPENAI_URL + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    }
  });
}

async function readJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function responsePayload(data) {
  return {
    id: data.id,
    object: "veylola.response",
    created_at: data.created_at,
    model: data.model || AI_MODEL,
    response: data.output_text || "",
    output: data.output || [],
    usage: data.usage || null,
    status: data.status || "completed"
  };
}

function buildInput(message, input) {
  if (Array.isArray(input)) return input;
  if (typeof input === "string" && input.trim()) return input.trim();
  if (typeof message === "string" && message.trim()) return message.trim();
  return null;
}

function buildTools(body) {
  const tools = Array.isArray(body.tools) ? body.tools : [];
  if (body.web_search === true) {
    tools.push({ type: "web_search", search_context_size: body.search_context_size || "medium" });
  }
  if (Array.isArray(body.vector_store_ids) && body.vector_store_ids.length) {
    tools.push({ type: "file_search", vector_store_ids: body.vector_store_ids });
  }
  return tools;
}

app.get("/", (_req, res) => res.json({
  name: "Veylola AI API",
  status: "ok",
  version: "2.0.0",
  provider: useLocalAI() ? "local" : "openai",
  model: AI_MODEL,
  capabilities: ["chat", "streaming", "vision", "image_generation", "video_generation", "music", ...(useLocalAI() ? [] : ["web_search", "file_search"])]
}));

app.get("/health", (_req, res) => res.json({
  status: "healthy",
  uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
  provider: useLocalAI() ? "local" : "openai",
  model: AI_MODEL
}));

app.get("/v1/local/status", async (_req, res) => {
  if (!useLocalAI()) return res.json({ enabled: false, provider: "openai", model: AI_MODEL });
  try {
    const upstream = await localAI("/models", { method: "GET" });
    const data = await readJson(upstream);
    if (!upstream.ok) return res.status(503).json({ enabled: true, reachable: false, error: data?.error || data });
    return res.json({ enabled: true, reachable: true, provider: "local", model: AI_MODEL, models: data.models || [] });
  } catch (e) {
    return res.status(503).json({ enabled: true, reachable: false, error: e.message });
  }
});

app.get("/v1/capabilities", (_req, res) => res.json({
  chat: true,
  streaming: true,
  provider: useLocalAI() ? "local" : "openai",
  web_search: !useLocalAI(),
  file_search: true,
  multimodal_input: true,
  image_generation: true,
  video_generation: true,
  music_generation: Boolean(process.env.MUSIC_API_URL && process.env.MUSIC_API_KEY)
}));

app.post("/chat", async (req, res) => {
  req.body = { ...req.body, web_search: req.body?.web_search ?? false };
  return handleResponse(req, res);
});

app.post("/v1/responses", handleResponse);

async function handleResponse(req, res) {
  const body = req.body ?? {};
  const input = buildInput(body.message, body.input);
  if (!input) return fail(res, 400, "message or input is required");

  const payload = {
    model: body.model || AI_MODEL,
    input,
    store: body.store !== false,
    ...(body.instructions ? { instructions: String(body.instructions) } : {}),
    ...(body.previous_response_id ? { previous_response_id: String(body.previous_response_id) } : {}),
    ...(body.temperature !== undefined ? { temperature: Number(body.temperature) } : {}),
    ...(body.max_output_tokens ? { max_output_tokens: Number(body.max_output_tokens) } : {}),
    ...(buildTools(body).length ? { tools: buildTools(body) } : {})
  };

  try {
    if (useLocalAI()) {
      const upstream = await localAI("/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: body.model || AI_MODEL,
          messages: localMessages(input),
          ...(body.temperature !== undefined ? { temperature: Number(body.temperature) } : {}),
          ...(body.max_output_tokens ? { max_tokens: Number(body.max_output_tokens) } : {}),
          ...(body.stream ? { stream: true } : {})
        })
      });

      if (body.stream) {
        res.status(upstream.status);
        res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        if (!upstream.body) return res.end();
        const reader = upstream.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
        } finally {
          res.end();
        }
        return;
      }

      const local = await readJson(upstream);
      if (!upstream.ok) return fail(res, upstream.status, "Local AI request failed", local?.error?.message || local);
      return res.json({
        id: local.id || crypto.randomUUID(),
        object: "veylola.response",
        created_at: Math.floor(Date.now() / 1000),
        model: local.model || AI_MODEL,
        response: local.choices?.[0]?.message?.content || "",
        output: local.choices?.[0] ? [{ type: "message", content: [{ type: "output_text", text: local.choices[0].message.content || "" }] }] : [],
        usage: local.usage || null,
        status: "completed"
      });
    }

    const upstream = await openai("/responses", {
      method: "POST",
      body: JSON.stringify({ ...payload, ...(body.stream ? { stream: true } : {}) })
    });

    if (body.stream) {
      res.status(upstream.status);
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      if (!upstream.body) return res.end();
      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
      } finally {
        res.end();
      }
      return;
    }

    const data = await readJson(upstream);
    if (!upstream.ok) return fail(res, upstream.status, "AI provider request failed", data?.error?.message || data);
    return res.json(responsePayload(data));
  } catch (e) {
    console.error(e);
    return fail(res, e.status || 500, e.message || "Server error");
  }
}


const XAI_URL = "https://api.x.ai/v1";
const GROK_MODEL = process.env.GROK_MODEL || "grok-4.7";

async function xai(path, options = {}) {
  const key = process.env.XAI_API_KEY;
  if (!key) throw Object.assign(new Error("XAI_API_KEY is not configured"), { status: 500 });
  return fetchWithRetry(XAI_URL + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

function grokTools(body) {
  const tools = Array.isArray(body.tools) ? [...body.tools] : [];
  if (body.web_search !== false) tools.push({ type: "web_search" });
  if (body.x_search === true) tools.push({ type: "x_search" });
  if (body.code_execution === true) tools.push({ type: "code_interpreter" });
  if (Array.isArray(body.vector_store_ids) && body.vector_store_ids.length) {
    tools.push({ type: "file_search", vector_store_ids: body.vector_store_ids });
  }
  return tools;
}

function grokPayload(body) {
  const input = buildInput(body.message, body.input);
  if (!input) return null;
  return {
    model: body.model || GROK_MODEL,
    input,
    store: body.store !== false,
    ...(body.instructions ? { instructions: String(body.instructions) } : {}),
    ...(body.previous_response_id ? { previous_response_id: String(body.previous_response_id) } : {}),
    ...(body.reasoning_effort ? { reasoning_effort: body.reasoning_effort } : {}),
    ...(body.prompt_cache_key ? { prompt_cache_key: String(body.prompt_cache_key) } : {}),
    ...(grokTools(body).length ? { tools: grokTools(body) } : {})
  };
}

app.get("/v1/grok/capabilities", (_req, res) => res.json({
  model: GROK_MODEL,
  chat: true,
  reasoning: true,
  web_search: true,
  x_search: true,
  code_execution: true,
  file_search: true,
  citations: true,
  streaming: true
}));

app.post("/v1/grok/responses", async (req, res) => {
  const body = req.body || {};
  const payload = grokPayload(body);
  if (!payload) return fail(res, 400, "message or input is required");

  try {
    const upstream = await xai("/responses", {
      method: "POST",
      body: JSON.stringify({ ...payload, ...(body.stream ? { stream: true } : {}) })
    });

    if (body.stream) {
      res.status(upstream.status);
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      if (!upstream.body) return res.end();
      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
      } finally {
        res.end();
      }
      return;
    }

    const data = await readJson(upstream);
    if (!upstream.ok) return fail(res, upstream.status, "Grok request failed", data?.error?.message || data);

    const citations = [];
    for (const item of data.output || []) {
      for (const part of item.content || []) {
        if (part.type === "source" && part.url) citations.push(part.url);
      }
    }

    return res.json({
      id: data.id,
      object: "veylola.grok.response",
      created_at: data.created_at,
      model: data.model || GROK_MODEL,
      response: data.output_text || "",
      output: data.output || [],
      citations: [...new Set(citations)],
      usage: data.usage || null,
      status: data.status || "completed"
    });
  } catch (e) {
    console.error(e);
    return fail(res, e.status || 500, e.message || "Grok server error");
  }
});

app.post("/v1/files", upload.single("file"), async (req, res) => {
  if (!req.file) return fail(res, 400, "file is required");
  try {
    const form = new FormData();
    form.append("purpose", req.body.purpose || "assistants");
    form.append("file", new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);
    const upstream = await openai("/files", { method: "POST", body: form });
    const data = await readJson(upstream);
    if (!upstream.ok) return fail(res, upstream.status, "File upload failed", data?.error?.message || data);
    return res.status(upstream.status).json(data);
  } catch (e) {
    console.error(e);
    return fail(res, e.status || 500, e.message || "File upload failed");
  }
});

app.post("/v1/vector-stores", async (req, res) => {
  try {
    const upstream = await openai("/vector_stores", {
      method: "POST",
      body: JSON.stringify({
        name: req.body?.name || "Veylola Knowledge Base",
        ...(req.body?.description ? { description: req.body.description } : {}),
        ...(Array.isArray(req.body?.file_ids) ? { file_ids: req.body.file_ids } : {})
      })
    });
    const data = await readJson(upstream);
    if (!upstream.ok) return fail(res, upstream.status, "Vector store creation failed", data?.error?.message || data);
    return res.status(upstream.status).json(data);
  } catch (e) {
    return fail(res, e.status || 500, e.message || "Vector store creation failed");
  }
});

app.post("/v1/vector-stores/:id/files", async (req, res) => {
  const { file_id, attributes } = req.body || {};
  if (!file_id) return fail(res, 400, "file_id is required");
  try {
    const upstream = await openai(`/vector_stores/${encodeURIComponent(req.params.id)}/files`, {
      method: "POST",
      body: JSON.stringify({ file_id, ...(attributes ? { attributes } : {}) })
    });
    const data = await readJson(upstream);
    if (!upstream.ok) return fail(res, upstream.status, "Adding file to vector store failed", data?.error?.message || data);
    return res.status(upstream.status).json(data);
  } catch (e) {
    return fail(res, e.status || 500, e.message || "Vector store request failed");
  }
});

app.post("/image", async (req, res) => {
  const { prompt, model = "gpt-image-2", size = "1024x1024", quality = "high", n = 1 } = req.body ?? {};
  if (typeof prompt !== "string" || !prompt.trim()) return fail(res, 400, "prompt is required");
  try {
    if (LOCAL_IMAGE_URL) {
      const upstream = await fetchWithRetry(LOCAL_IMAGE_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), model, size, quality, n })
      });
      const data = await readJson(upstream);
      if (!upstream.ok) return fail(res, upstream.status, "Local image generation failed", data?.error?.message || data);
      return res.json(data);
    }
    const upstream = await openai("/images/generations", {
      method: "POST",
      body: JSON.stringify({
        model, prompt: prompt.trim(), size, quality,
        n: Math.min(Math.max(Number(n) || 1, 1), 4)
      })
    });
    const data = await readJson(upstream);
    if (!upstream.ok) return fail(res, upstream.status, "Image generation failed", data?.error?.message || data);
    return res.json({ data: data.data || [], model, quality });
  } catch (e) {
    console.error(e);
    return fail(res, e.status || 500, e.message || "Server error");
  }
});

app.get("/v1/video/capabilities", (_req, res) => res.json({
  self_hosted: Boolean(LOCAL_VIDEO_URL),
  endpoint_configured: Boolean(LOCAL_VIDEO_URL),
  mode: LOCAL_VIDEO_URL ? "self-hosted" : "provider",
  supported_durations: LOCAL_VIDEO_URL ? [5, 10, 15, 30, 60] : [4, 8, 12],
  max_duration_seconds: LOCAL_VIDEO_URL ? 60 : 12,
  image_to_video: Boolean(LOCAL_VIDEO_URL),
  controls: LOCAL_VIDEO_URL
    ? ["negative_prompt", "seed", "steps", "guidance", "style", "camera", "motion", "quality", "image_url"]
    : [],
  note: LOCAL_VIDEO_URL
    ? "Requests are forwarded to your own video-generation server. The server/model defines the actual generation quality."
    : "Configure LOCAL_VIDEO_URL for longer, self-hosted generation and advanced controls."
}));

app.post("/video", async (req, res) => {
  const {
    prompt,
    model = "sora-2",
    seconds = 8,
    size = "720x1280",
    negative_prompt,
    seed,
    steps,
    guidance,
    style,
    camera,
    motion,
    quality,
    image_url
  } = req.body ?? {};
  if (typeof prompt !== "string" || !prompt.trim()) return fail(res, 400, "prompt is required");
  const requestedSeconds = Number(seconds);
  const validSeconds = LOCAL_VIDEO_URL
    ? Math.min(Math.max(Number.isFinite(requestedSeconds) ? requestedSeconds : 8, 5), 60)
    : ([4, 8, 12].includes(requestedSeconds) ? requestedSeconds : 8);
  try {
    if (LOCAL_VIDEO_URL) {
      const upstream = await fetchWithRetry(LOCAL_VIDEO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model,
          seconds: validSeconds,
          size,
          ...(typeof negative_prompt === "string" ? { negative_prompt } : {}),
          ...(seed !== undefined && Number.isFinite(Number(seed)) ? { seed: Number(seed) } : {}),
          ...(steps !== undefined && Number.isFinite(Number(steps)) ? { steps: Number(steps) } : {}),
          ...(guidance !== undefined && Number.isFinite(Number(guidance)) ? { guidance: Number(guidance) } : {}),
          ...(typeof style === "string" ? { style } : {}),
          ...(typeof camera === "string" ? { camera } : {}),
          ...(typeof motion === "string" ? { motion } : {}),
          ...(typeof quality === "string" ? { quality } : {}),
          ...(typeof image_url === "string" && image_url ? { image_url } : {})
        })
      });
      const data = await readJson(upstream);
      if (!upstream.ok) return fail(res, upstream.status, "Local video generation failed", data?.error?.message || data);
      return res.status(upstream.status === 200 ? 202 : upstream.status).json(data);
    }
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt.trim());
    form.append("seconds", String(validSeconds));
    form.append("size", size);
    const upstream = await openai("/videos", {
      method: "POST",
      body: form
    });
    const data = await readJson(upstream);
    if (!upstream.ok) return fail(res, upstream.status, "Video generation failed", data?.error?.message || data);
    return res.status(202).json(data);
  } catch (e) {
    console.error(e);
    return fail(res, e.status || 500, e.message || "Server error");
  }
});

app.post("/music", async (req, res) => {
  const base = process.env.MUSIC_API_URL, key = process.env.MUSIC_API_KEY;
  if (!LOCAL_MUSIC_URL && (!base || !key)) return fail(res, 503, "Music provider is not configured");
  if (typeof req.body?.prompt !== "string" || !req.body.prompt.trim()) return fail(res, 400, "prompt is required");
  try {
    const upstream = await fetchWithRetry(LOCAL_MUSIC_URL || base, {
      method: "POST",
      headers: LOCAL_MUSIC_URL
        ? { "Content-Type": "application/json" }
        : { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    const data = await readJson(upstream);
    if (!upstream.ok) return fail(res, upstream.status, "Music generation failed", data?.error?.message || data);
    return res.status(202).json(data);
  } catch (e) {
    console.error(e);
    return fail(res, 500, e.message || "Server error");
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  return fail(res, err.status || 500, err.message || "Unexpected server error");
});

app.listen(PORT, "0.0.0.0", () => console.log(`Veylola AI API v2 listening on ${PORT}`));
