# Veylola AI API

Render-ready Node.js API for the Veylola AI mobile app.

## Endpoints

Base URL after Render deployment:

`https://YOUR-SERVICE.onrender.com`

- GET `/health`
- POST `/chat`
- POST `/image`
- POST `/video`
- POST `/music`

## Render

Create a Render Web Service from this GitHub repository.

Build command:

`npm install`

Start command:

`npm start`

Health check:

`/health`

Required environment variables:

`OPENAI_API_KEY`
`AI_MODEL=gpt-5.6`

Optional music provider:

`MUSIC_API_URL`
`MUSIC_API_KEY`

Never put provider API keys in the Veylola Android app.

## Chat request

```json
{"message":"Hello"}
```

Optional conversation continuation:

```json
{"message":"Continue","previous_response_id":"response-id"}
```

## Image request

```json
{"prompt":"A cinematic futuristic city at night","size":"1024x1024","quality":"high"}
```

## Video request

```json
{"prompt":"A cinematic vertical shot of a futuristic Nigerian city at night","seconds":8,"size":"720x1280"}
```

## Music request

```json
{"prompt":"Modern Nigerian Afrobeats with warm bass and melodic guitar","duration":30}
```

Music uses the configured licensed provider adapter.

## Security

For a public production API, add authentication, rate limiting, quotas, logging and abuse protection before opening it to unrestricted traffic.
