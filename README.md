# Destiny AI API

A Supabase Edge Function API for Destiny AI.

## Endpoint

POST:

https://YOUR_PROJECT_REF.supabase.co/functions/v1/destiny-ai

JSON body:

{
  "message": "Hello Destiny AI",
  "previous_response_id": "optional-response-id"
}

## Required production secret

Set OPENAI_API_KEY in Supabase Edge Function Secrets.

Optional:

AI_MODEL=gpt-5.6

Never commit a real API key to this repository.

## Deploy

supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy destiny-ai

## Example request

curl --request POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/destiny-ai' \
  --header 'Content-Type: application/json' \
  --data '{"message":"Hello Destiny AI"}'

The API returns a response id. Pass that id as previous_response_id to continue a conversation.
