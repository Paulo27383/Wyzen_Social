import * as SecureStore from "expo-secure-store";
import { classifyLocalIntent, planCommand } from "./assistant";
import { memoryContext } from "./memory";

export type AssistantReply = {
  answer: string;
  intent?: string;
  engine?: string;
  actions?: Array<{ type: "open_url"; url: string; label: string }>;
  modelRequired?: boolean;
  contextTurns?: number;
};

const SERVER_URL = "https://wyzen-ai-server.onrender.com";
const USER_ID_KEY = "wyzen.conversation.user-id.v1";
const REQUEST_TIMEOUT_MS = 25000;

async function getConversationUserId(): Promise<string> {
  const saved = await SecureStore.getItemAsync(USER_ID_KEY);
  if (saved) return saved;
  const created = "android-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  await SecureStore.setItemAsync(USER_ID_KEY, created);
  return created;
}

function localUtilityReply(command: string): AssistantReply {
  const plan = planCommand(command);
  return {
    answer: plan.steps.join("\\n"),
    intent: plan.intent,
    engine: "wyzen-device-utilities"
  };
}

/**
 * WYZEN's own conversational API. No OpenAI, ChatGPT, or third-party
 * generative model is called. The server owns dialogue rules, context,
 * and the trainable intent classifier; personal notes remain on-device
 * and are sent only as context for this request.
 */
export async function askWyzen(command: string): Promise<AssistantReply> {
  const intent = classifyLocalIntent(command);
  if (["time", "date"].includes(intent)) return localUtilityReply(command);

  const [userId, memories] = await Promise.all([
    getConversationUserId(),
    memoryContext()
  ]);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(SERVER_URL + "/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        message: command.trim(),
        user_id: userId,
        memory_context: memories
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error("Servidor WYZEN respondeu com estado " + response.status + ".");
    }

    const payload = await response.json() as {
      answer?: string;
      intent?: string;
      engine?: string;
      context_turns?: number;
      actions?: AssistantReply["actions"];
    };

    if (typeof payload.answer !== "string" || !payload.answer.trim()) {
      throw new Error("O motor WYZEN devolveu uma resposta vazia.");
    }

    return {
      answer: payload.answer.trim(),
      intent: payload.intent || intent,
      engine: payload.engine || "wyzen-native-dialogue-engine",
      contextTurns: payload.context_turns,
      actions: Array.isArray(payload.actions) ? payload.actions : []
    };
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError"
      ? "O servidor WYZEN demorou demasiado a responder."
      : error instanceof Error ? error.message : "Falha de ligação desconhecida.";
    return {
      answer: "Neste momento não consegui ligar ao meu núcleo conversacional próprio. " +
        "As funções locais continuam disponíveis. " + reason,
      intent,
      engine: "wyzen-offline-unavailable"
    };
  } finally {
    clearTimeout(timeout);
  }
}
