import { classifyLocalIntent, planCommand } from "./assistant";
import { memoryContext, recentInteractions } from "./memory";
import { generateLocalResponse, getLocalModelStatus } from "./localModel";
import { calculateMath } from "./mathEngine";
import { answerOwnerProfile, answerWyzenIdentity, getOwnerProfile, learnOwnerFact } from "./ownerProfile";
import { buildKnowledgeContext, formatKnowledgeFallback, searchKnowledge } from "./knowledgeSearch";

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


function addressReply(reply: AssistantReply, preferredName: string): AssistantReply {
  const answer = reply.answer.trim();
  if (!preferredName || answer.toLocaleLowerCase("pt-PT").includes(preferredName.toLocaleLowerCase("pt-PT"))) {
    return { ...reply, answer };
  }
  return { ...reply, answer: preferredName + ", " + answer };
}

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
  const initialProfile = await getOwnerProfile();
  const preferredName = initialProfile.preferredAddress || initialProfile.displayName || "Podolsky";
  if (!cleanCommand) {
    return addressReply({ answer: "Diz-me o que precisas.", intent: "clarification", engine: "wyzen-device" }, preferredName);
  }

  const calculation = calculateMath(cleanCommand);
  if (calculation.handled) {
    return addressReply({
      answer: calculation.answer || "Não consegui calcular essa operação.",
      intent: "calculation",
      engine: "wyzen-local-calculation-engine",
      modelRequired: false
    }, preferredName);
  }

  const intent = classifyLocalIntent(cleanCommand);
  if (intent === "time" || intent === "date") return addressReply(localUtilityReply(cleanCommand), preferredName);
  if (intent === "greeting") {
    const profile = await getOwnerProfile();
    return addressReply({ answer: `Olá, ${profile.preferredAddress || profile.displayName}! Estou aqui. O que vamos fazer hoje?`, intent, engine: "wyzen-personality-core", modelRequired: false }, preferredName);
  }
  if (intent === "profile") {
    return addressReply({ answer: await answerOwnerProfile(cleanCommand), intent, engine: "wyzen-owner-profile", modelRequired: false }, preferredName);
  }
  if (intent === "wyzen_identity") {
    return addressReply({ answer: answerWyzenIdentity(cleanCommand), intent, engine: "wyzen-personality-core", modelRequired: false }, preferredName);
  }
  if (intent === "creator") {
    return addressReply({ answer: "Foste tu, Podolsky, quem me criou e está a desenvolver a WYZEN AI. Sou a tua assistente pessoal.", intent, engine: "wyzen-personality-core", modelRequired: false }, preferredName);
  }
  if (await learnOwnerFact(cleanCommand)) {
    return addressReply({
      answer: "Está bem, Podolsky. Guardei essa informação no teu perfil pessoal cifrado e vou usá-la quando for relevante.",
      intent: "profile_update",
      engine: "wyzen-owner-profile",
      modelRequired: false
    }, preferredName);
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
    const operatingPrinciples = [
      "PRINCÍPIO CENTRAL WYZEN: nunca termines num simples não posso ou não. Se um caminho estiver indisponível, explica o limite com honestidade e apresenta uma alternativa concreta, segura e executável.",
      "Age com iniciativa: identifica o objetivo, divide-o em etapas, aproveita as ferramentas disponíveis e acompanha o progresso.",
      "Não afirmes que executaste algo sem confirmação real. Não inventes resultados, acesso, permissões ou capacidades.",
      "Pede confirmação antes de chamadas, mensagens, compras, publicações, eliminações ou outras ações sensíveis."
    ].join("\n");
    memories = [operatingPrinciples, ownerFacts, savedMemories].filter(Boolean).join("\n");
    dialogue = history
      .filter(item => item.kind === "conversation" || item.kind === "advice")
      .slice(0, 6)
      .reverse()
      .map(item => ({ user: item.userText, assistant: item.assistantText }));
  } catch {
    // A conversa continua mesmo que a memória ou o histórico local estejam indisponíveis.
  }

  let knowledgeSources: Awaited<ReturnType<typeof searchKnowledge>> = [];
  try {
    knowledgeSources = await searchKnowledge(cleanCommand);
  } catch {
    // A falha da pesquisa não deve impedir a conversa normal.
  }

  let localModelError = "";
  try {
    const status = await getLocalModelStatus();
    if (status.downloaded) {
      const answer = await generateLocalResponse(cleanCommand, memories, dialogue, buildKnowledgeContext(knowledgeSources));
      if (answer.trim()) {
        return addressReply({
          answer: knowledgeSources.length
            ? answer.trim() + "\n\nFontes consultadas:\n" + knowledgeSources.map((source, index) => (index + 1) + ". " + source.title + " (" + source.provider + ") — " + source.url).join("\n")
            : answer.trim(),
          intent,
          engine: "wyzen-local-llm",
          modelRequired: false
        }, preferredName);
      }
      localModelError = "O modelo local devolveu uma resposta vazia.";
    }
  } catch (error) {
    localModelError = error instanceof Error ? error.message : "Falha no modelo local.";
  }

  if (knowledgeSources.length) {
    return addressReply({
      answer: formatKnowledgeFallback(knowledgeSources),
      intent: "knowledge_search",
      engine: "wyzen-wikimedia-knowledge",
      modelRequired: false
    }, preferredName);
  }

  try {
    const fallback = await askOwnServer(cleanCommand, intent);
    return addressReply({
      ...fallback,
      engine: fallback.engine || "wyzen-native-dialogue-engine",
      modelRequired: true
    }, preferredName);
  } catch (error) {
    const serverError = error instanceof Error && error.name === "AbortError"
      ? "O servidor próprio demorou demasiado a responder."
      : error instanceof Error ? error.message : "Falha de ligação ao servidor próprio.";
    const localHint = localModelError
      ? " O modelo local também não ficou disponível: " + localModelError
      : " O modelo generativo local ainda não foi instalado.";
    return addressReply({
      answer: "A ligação generativa está temporariamente indisponível. " + serverError + localHint +
        " Ainda podemos avançar: envia uma pergunta mais específica, pede uma operação local (tarefas, memória ou aplicações Android) ou instala o modelo local para ativar respostas generativas no dispositivo.",
      intent,
      engine: "wyzen-offline-unavailable",
      modelRequired: true
    }, preferredName);
  }
}
