import { classifyLocalIntent, planCommand } from "./assistant";
import { memoryContext } from "./memory";
import { generateLocalResponse, getLocalModelStatus } from "./localModel";

export type AssistantReply = {
  answer: string;
  intent?: string;
  engine?: string;
  actions?: Array<{ type: "open_url"; url: string; label: string }>;
  modelRequired?: boolean;
};

function localUtilityReply(command: string): AssistantReply {
  const plan = planCommand(command);
  return {
    answer: plan.steps.join("\n"),
    intent: plan.intent,
    engine: "wyzen-device-utilities"
  };
}

/**
 * All conversational generation is performed by the GGUF model on the phone.
 * No conversation is sent to the Wyzen cloud server or to a third-party AI API.
 */
export async function askWyzen(command: string): Promise<AssistantReply> {
  const intent = classifyLocalIntent(command);
  if (["time", "date"].includes(intent)) return localUtilityReply(command);

  const status = await getLocalModelStatus();
  if (!status.downloaded) {
    return {
      answer: "O cérebro local da WYZEN ainda não foi instalado. Descarrega primeiro o modelo SmolLM2 (aproximadamente 271 MB) nas definições da Wyzen.",
      intent,
      engine: "wyzen-local-model-not-installed",
      modelRequired: true
    };
  }

  try {
    const memories = await memoryContext();
    const answer = await generateLocalResponse(command, memories);
    return {
      answer: answer || "Não consegui formular uma resposta. Tenta explicar o pedido de outra forma.",
      intent,
      engine: "wyzen-llama-cpp-local"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    return {
      answer: `Não consegui iniciar o modelo local: ${message}`,
      intent,
      engine: "wyzen-local-model-error"
    };
  }
}
