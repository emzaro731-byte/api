# Veylola AI API

ChatGPT-like backend for the Veylola Android app, hosted on Render.

## Core API

- GET /health
- GET /v1/capabilities
- POST /chat
- POST /v1/responses
- POST /v1/files
- POST /v1/vector-stores
- POST /v1/vector-stores/:id/files
- POST /image
- POST /video
- POST /music

## Chat / Responses

POST /v1/responses:

{
  "input": "Explain quantum computing simply",
  "web_search": true,
  "stream": false
}

For multimodal input, send OpenAI Responses API input content objects in `input`.

Use `previous_response_id` for multi-turn context. The API can also use OpenAI-hosted conversation state through stored Responses.

## Web search

Set `web_search: true`. Veylola adds OpenAI's built-in web_search tool.

## Files and knowledge

1. Upload a file with multipart/form-data to /v1/files using field `file`.
2. Create a vector store with /v1/vector-stores.
3. Add uploaded file IDs to the vector store.
4. Call /v1/responses with `vector_store_ids: ["vs_..."]`.

## Security

Set `VEYLOLA_API_KEY` in Render to require the Android app to authenticate. Keep `OPENAI_API_KEY` server-side only.

A simple in-memory rate limiter is enabled. For multi-instance production deployments, replace it with Redis or another shared store.

## Render

Build: `npm install`
Start: `npm start`
Health check: `/health`

Environment variables:

- OPENAI_API_KEY
- AI_MODEL
- VEYLOLA_API_KEY
- RATE_LIMIT_PER_MINUTE
- MUSIC_API_URL
- MUSIC_API_KEY
