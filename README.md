# Veylola AI API

A self-hostable backend for the Veylola Android app.

## Free / open-source mode

The API can run without OpenAI or xAI keys by using an OpenAI-compatible local model server such as Ollama.

Architecture:

Veylola Android app → Veylola API → Ollama → open-source model

Example environment:

```env
AI_PROVIDER=local
AI_MODEL=llama3.2
LOCAL_AI_URL=http://127.0.0.1:11434/v1
```

Install Ollama on the computer that will run the model, download an open-source model, then start Ollama. The Veylola API forwards chat requests to Ollama's OpenAI-compatible API.

### Important

A local API can avoid per-request OpenAI/xAI charges, but the computer still needs CPU/GPU/RAM and electricity. A free Render web service cannot magically provide unlimited GPU inference.

## Endpoints

- GET /health
- GET /v1/capabilities
- GET /v1/local/status
- POST /chat
- POST /v1/responses
- POST /v1/files
- POST /v1/vector-stores
- POST /image
- POST /video
- POST /music
- POST /v1/grok/responses

## Local chat

POST /v1/responses:

```json
{
  "input": "Explain electrical circuits simply"
}
```

With local mode enabled, this becomes an OpenAI-compatible chat-completions request to the configured `LOCAL_AI_URL`.

Streaming is also supported.

## Hosted mode

If you prefer OpenAI instead, set:

```env
AI_PROVIDER=openai
AI_MODEL=gpt-5.6
OPENAI_API_KEY=your_key
```

Grok remains separately available through `/v1/grok/responses` when `XAI_API_KEY` is configured.

## Media

The existing image, video and music routes can still use their configured providers. For a completely self-hosted media stack, add local adapters using `LOCAL_IMAGE_URL`, `LOCAL_VIDEO_URL`, and `LOCAL_MUSIC_URL`; the model server you choose must provide a compatible HTTP API.

## Security

Set `VEYLOLA_API_KEY` before exposing the API publicly. Never put model-provider secret keys in the Android app.

## Render

Render can host the API routing layer, but a normal free web service is not a free GPU server. For genuinely self-hosted inference, run the model server on your own computer or another machine with suitable hardware and point `LOCAL_AI_URL` at it.
