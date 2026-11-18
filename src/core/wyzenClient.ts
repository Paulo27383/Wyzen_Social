import { classifyLocalIntent, planCommand } from "./assistant";
import { memoryContext, recentInteractions } from "./memory";
import { generateLocalResponse, getLocalModelStatus } from "./localModel";
import { calculateMath } from "./mathEngine";
import { answerOwnerProfile, answerWyzenIdentity, getOwnerProfile, learnOwnerFact } from "./ownerProfile";

export type AssistantReply = {
  answer: string;
  intent?: string;
  engine?: string;
  actions?: Array<{ type: "open_url"; url: string; label: string }>;
  modelRequired?: boolean;
  contextTurns?: number;
};

const SERVER_URL = (process.env.EXPO_PUBLIC_WYZEN_SERVER_URL || "https://wyzen-ai-server.onrender.com").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 25000;


function localUtilityReply(command: string): AssistantReply {
  const plan = planCommand(command);
  return {
    answer: plan.steps.join("\n"),
    intent: plan.intent,
    engine: "wyzen-device-utilities"
  };
}

async function askOwnServer(command: string, intent: string): Promise<AssistantReply> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(SERVER_URL + "/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      // Personal memory and conversation history remain on the device.
      body: JSON.stringify({ message: command.trim() }),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error("Servidor próprio WYZEN respondeu com estado " + response.status + ".");
    }
    const payload = await response.json() as {
      answer?: string;
      intent?: string;
      engine?: string;
      context_turns?: number;
      actions?: AssistantReply["actions"];
    };
    if (typeof payload.answer !== "string" || !payload.answer.trim()) {
      throw new Error("O servidor WYZEN devolveu uma resposta vazia.");
    }
    return {
      answer: payload.answer.trim(),
      intent: payload.intent || intent,
      engine: payload.engine || "wyzen-native-dialogue-engine",
      contextTurns: payload.context_turns,
      actions: Array.isArray(payload.actions) ? payload.actions : []
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Conversação prioritariamente local: quando o modelo GGUF está instalado,
 * a geração acontece no dispositivo. Se ainda não estiver instalado ou falhar,
 * usa-se apenas o servidor próprio WYZEN (regras/contexto), nunca OpenAI.
 */
export async function askWyzen(command: string): Promise<AssistantReply> {
  const cleanCommand = command.trim();
  if (!cleanCommand) {
    return { answer: "Diz-me o que precisas.", intent: "clarification", engine: "wyzen-device" };
  }

  const calculation = calculateMath(cleanCommand);
  if (calculation.handled) {
    return {
      answer: calculation.answer || "Não consegui calcular essa operação.",
      intent: "calculation",
      engine: "wyzen-local-calculation-engine",
      modelRequired: false
    };
  }

  const intent = classifyLocalIntent(cleanCommand);
  if (intent === "time" || intent === "date") return localUtilityReply(cleanCommand);
  if (intent === "greeting") {
    const profile = await getOwnerProfile();
    return { answer: `Olá, ${profile.preferredAddress || profile.displayName}! Estou aqui. O que vamos fazer hoje?`, intent, engine: "wyzen-personality-core", modelRequired: false };
  }
  if (intent === "profile") {
    return { answer: await answerOwnerProfile(cleanCommand), intent, engine: "wyzen-owner-profile", modelRequired: false };
  }
  if (intent === "wyzen_identity") {
    return { answer: answerWyzenIdentity(cleanCommand), intent, engine: "wyzen-personality-core", modelRequired: false };
  }
  if (await learnOwnerFact(cleanCommand)) {
    return {
      answer: "Está bem, Podolsky. Guardei essa informação no teu perfil pessoal cifrado e vou usá-la quando for relevante.",
      intent: "profile_update",
      engine: "wyzen-owner-profile",
      modelRequired: false
    };
  }

  let memories = "";
  let dialogue: Array<{ user: string; assistant: string }> = [];
  try {
    const [savedMemories, history, owner] = await Promise.all([memoryContext(), recentInteractions(7), getOwnerProfile()]);
    const ownerFacts = [
      "Perfil do proprietário da WYZEN: " + owner.displayName + ".",
      "Relação: " + owner.role + ".",
      "Forma de tratamento preferida: " + owner.preferredAddress + ".",
      owner.ageYears === null ? "" : "Idade confirmada no perfil: " + owner.ageYears + " anos.",
      owner.course ? "Formação: " + owner.course + "." : "",
      owner.residence ? "Residência indicada: " + owner.residence + "." : "",
      owner.motherName ? "Nome da mãe indicado: " + owner.motherName + "." : ""
    ].filter(Boolean).join("\n");
    memories = [ownerFacts, savedMemories].filter(Boolean).join("\n");
    dialogue = history
      .filter(item => item.kind === "conversation" || item.kind === "advice")
      .slice(0, 6)
      .reverse()
      .map(item => ({ user: item.userText, assistant: item.assistantText }));
  } catch {
    // A conversa continua mesmo que a memória ou o histórico local estejam indisponíveis.
  }

  let localModelError = "";
  try {
    const status = await getLocalModelStatus();
    if (status.downloaded) {
      const answer = await generateLocalResponse(cleanCommand, memories, dialogue);
      if (answer.trim()) {
        return {
          answer: answer.trim(),
          intent,
          engine: "wyzen-local-llm",
          modelRequired: false
        };
      }
      localModelError = "O modelo local devolveu uma resposta vazia.";
    }
  } catch (error) {
    localModelError = error instanceof Error ? error.message : "Falha no modelo local.";
  }

  try {
    const fallback = await askOwnServer(cleanCommand, intent);
    return {
      ...fallback,
      engine: fallback.engine || "wyzen-native-dialogue-engine",
      modelRequired: true
    };
  } catch (error) {
    const serverError = error instanceof Error && error.name === "AbortError"
      ? "O servidor próprio demorou demasiado a responder."
      : error instanceof Error ? error.message : "Falha de ligação ao servidor próprio.";
    const localHint = localModelError
      ? " O modelo local também não ficou disponível: " + localModelError
      : " O modelo generativo local ainda não foi instalado.";
    return {
      answer: "Neste momento não consegui gerar uma resposta. " + serverError + localHint +
        " Instala ou verifica o modelo local e tenta novamente.",
      intent,
      engine: "wyzen-offline-unavailable",
      modelRequired: true
    };
  }
}
