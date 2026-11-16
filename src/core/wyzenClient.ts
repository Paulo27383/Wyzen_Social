import { planCommand, CommandResult } from "./assistant";

const SERVER_URL = (process.env.EXPO_PUBLIC_WYZEN_SERVER_URL ?? "").replace(/\/$/, "");

export type AssistantReply = {
  answer: string;
  intent?: string;
  engine?: string;
  actions?: Array<{ type: "open_url"; url: string; label: string }>;
};

export async function askWyzen(command: string): Promise<AssistantReply> {
  if (!SERVER_URL) {
    const plan: CommandResult = planCommand(command);
    return {
      answer: [
        "O motor local recebeu a tua ordem.",
        ...plan.steps,
        "Configura EXPO_PUBLIC_WYZEN_SERVER_URL para ligar ao teu servidor próprio."
      ].join("\n"),
      engine: "android-local-planner"
    };
  }

  const response = await fetch(`${SERVER_URL}/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: command, user_id: "android-user" })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Servidor WYZEN indisponível (${response.status}): ${message}`);
  }
  return response.json() as Promise<AssistantReply>;
}
