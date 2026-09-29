# Destiny AI API

Supabase Edge Functions for Destiny AI chat, image generation, video generation, and music generation.

## Endpoints

Base URL:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1`

| Capability | Endpoint | Required secrets |
|---|---|---|
| Chat | `POST /destiny-ai` | `OPENAI_API_KEY` |
| Image | `POST /image-generate` | `OPENAI_API_KEY` |
| Video | `POST /video-generate` | `VIDEO_API_URL`, `VIDEO_API_KEY` |
| Music | `POST /music-generate` | `MUSIC_API_URL`, `MUSIC_API_KEY` |

## Chat

```json
{
  "message": "Explain quantum computing simply",
  "previous_response_id": "optional-response-id"
}
```

## Image

```json
{
  "prompt": "A cinematic futuristic city at night",
  "size": "1024x1024",
  "quality": "auto"
}
```

The image endpoint uses the configured OpenAI image model and returns the provider's image data.

## Video

```json
{
  "prompt": "A cinematic 10-second shot of a futuristic Nigerian city at night",
  "duration": 10
}
```

Video is implemented as a provider adapter. Set `VIDEO_API_URL` to the create-job endpoint of your chosen video provider and `VIDEO_API_KEY` to its secret key. The endpoint forwards the JSON body and returns the provider job response.

## Music

```json
{
  "prompt": "Modern Nigerian Afrobeats, warm bass, melodic guitar, energetic drums",
  "duration": 30
}
```

Music is implemented as a provider adapter for a licensed music-generation service. Set `MUSIC_API_URL` and `MUSIC_API_KEY` to that provider's API.

## Supabase secrets

Never commit real keys to GitHub.

Configure these in Supabase Edge Function Secrets:

```text
OPENAI_API_KEY=...
AI_MODEL=...
VIDEO_API_URL=...
VIDEO_API_KEY=...
MUSIC_API_URL=...
MUSIC_API_KEY=...
```

## Deploy

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy destiny-ai
supabase functions deploy image-generate
supabase functions deploy video-generate
supabase functions deploy music-generate
```

For production, add authentication, rate limiting, quotas, logging, and usage billing before exposing the endpoints publicly.
