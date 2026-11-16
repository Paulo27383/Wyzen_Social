import { Linking } from "react-native";
import { AssistantReply } from "./wyzenClient";

const ALLOWED_ACTIONS = new Set(["open_url"]);

export async function executeApprovedActions(reply: AssistantReply): Promise<string[]> {
  const results: string[] = [];
  for (const action of reply.actions ?? []) {
    if (!ALLOWED_ACTIONS.has(action.type)) {
      results.push(`Ação bloqueada: ${action.type}`);
      continue;
    }
    if (action.type === "open_url") {
      const url = action.url.trim();
      if (!/^https:\/\//i.test(url)) {
        results.push("URL bloqueado: apenas HTTPS é permitido.");
        continue;
      }
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        results.push(`Não foi possível abrir: ${url}`);
        continue;
      }
      await Linking.openURL(url);
      results.push(`Aberto: ${action.label || url}`);
    }
  }
  return results;
}
