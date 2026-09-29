import { withSupabase } from "npm:@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = Deno.env.get("AI_MODEL") ?? "gpt-5.6";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export default {
  fetch: withSupabase({ auth: "optional" }, async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json({ error: "POST required" }, 405);
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return json({ error: "OPENAI_API_KEY is not configured" }, 500);
    }

    try {
      const body = await req.json();
      const message = body?.message;
      const previousResponseId = body?.previous_response_id;

      if (typeof message !== "string" || !message.trim()) {
        return json({ error: "message must be a non-empty string" }, 400);
      }

      const payload: Record<string, unknown> = {
        model: MODEL,
        input: [
          {
            role: "developer",
            content:
              "You are Destiny AI, a helpful, accurate, safe and capable AI assistant. Give clear answers, explain reasoning when useful, and do not claim capabilities you do not have.",
          },
          {
            role: "user",
            content: message.trim(),
          },
        ],
        store: true,
      };

      if (typeof previousResponseId === "string" && previousResponseId) {
        payload.previous_response_id = previousResponseId;
      }

      const upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await upstream.json();

      if (!upstream.ok) {
        return json(
          {
            error: "AI provider request failed",
            details: data?.error?.message ?? "Unknown provider error",
          },
          upstream.status,
        );
      }

      return json({
        id: data.id,
        response: data.output_text ?? "",
        model: data.model ?? MODEL,
      });
    } catch (error) {
      console.error(error);
      return json({ error: "Invalid request or server error" }, 500);
    }
  }),
};
