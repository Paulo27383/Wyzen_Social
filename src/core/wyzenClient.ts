import { classifyLocalIntent, planCommand } from "./assistant";
import { memoryContext } from "./memory";

const SERVER_URL = (process.env.EXPO_PUBLIC_WYZEN_SERVER_URL ?? "https://wyzen-ai-server.onrender.com").replace(/\/$/, "");

export type AssistantReply = {
  answer: string;
  intent?: string;
  engine?: string;
  actions?: Array<{ type: "open_url"; url: string; label: string }>;
};

function localReply(command: string, reason?: string): AssistantReply {
  const plan = planCommand(command);
  return {
    answer: [...plan.steps, ...(reason ? ["Modo offline: " + reason] : [])].join("\n"),
    intent: plan.intent,
    engine: "wyzen-android-local"
  };
}

/** 90% online: only essential clock/date queries stay local. Conversation and saved
 * user memories are sent to Wyzen's own server. No third-party model is called. */
export async function askWyzen(command: string): Promise<AssistantReply> {
  const localIntent = classifyLocalIntent(command);
  if (["time", "date"].includes(localIntent)) return localReply(command);

  if (!SERVER_URL) return localReply(command, "servidor não configurado.");
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const memories = await memoryContext();
      const response = await fetch(`${SERVER_URL}/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: command,
          user_id: "android-user",
          memory_context: memories
        }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`servidor respondeu ${response.status}`);
      return await response.json() as AssistantReply;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError"
      ? "tempo de resposta excedido."
      : "servidor indisponível.";
    return localReply(command, reason);
  }
}
