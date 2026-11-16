import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Configura OPENAI_API_KEY nos secrets do Supabase." }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const { command } = await req.json();
    if (typeof command !== "string" || !command.trim() || command.length > 8000) {
      return new Response(JSON.stringify({ error: "Comando inválido." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const result = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-5-mini",
        instructions: "És a WYZEN AI, assistente pessoal em português europeu. Ajuda a planear e explicar tarefas. Não afirmes que executaste ações sem uma ferramenta real e confirmação do resultado. Nunca solicites palavras-passe ou segredos. Não ajudes a aceder a contas, dispositivos ou redes sem autorização. Responde de forma clara e prática.",
        input: command
      })
    });

    const payload = await result.json();
    if (!result.ok) {
      return new Response(JSON.stringify({ error: payload.error?.message || "Falha no fornecedor de IA." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const answer = (payload.output ?? [])
      .flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item.content ?? [])
      .filter((part: { type?: string }) => part.type === "output_text")
      .map((part: { text?: string }) => part.text ?? "")
      .join("\n");

    return new Response(JSON.stringify({ answer, actions: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch {
    return new Response(JSON.stringify({ error: "Não foi possível processar o comando." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
