import { planCommand, CommandResult } from "./assistant";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export type AssistantReply = {
  answer: string;
  actions?: Array<{ type: "open_url"; url: string; label: string }>;
};

export async function askWyzen(command: string): Promise<AssistantReply> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    const plan: CommandResult = planCommand(command);
    return {
      answer: [
        "O motor local recebeu a tua ordem.",
        ...plan.steps,
        "Para ativar respostas inteligentes, configura o backend Supabase e a chave do modelo no servidor."
      ].join("\n")
    };
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/wyzen-assistant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ command })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Motor remoto indisponível (${response.status}): ${message}`);
  }

  return response.json() as Promise<AssistantReply>;
}
