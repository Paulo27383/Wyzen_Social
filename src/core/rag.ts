import { recallWyzen, recentInteractions } from "./memory";

export type RetrievedKnowledge = {
  context: string;
  memories: number;
  conversations: number;
};

const STOP_WORDS = new Set([
  "a","as","o","os","um","uma","uns","umas","de","do","da","dos","das","em","no","na","nos","nas",
  "por","para","com","sem","sobre","entre","que","qual","quais","como","quando","onde","porque",
  "e","ou","mas","se","ao","aos","à","às","eu","tu","me","te","meu","minha","meus","minhas",
  "tua","teu","suas","seus","isso","essa","esse","esta","este","foi","ser","ter","estar"
]);

function normalize(value: string): string {
  return value.toLocaleLowerCase("pt-PT")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function terms(value: string): string[] {
  return [...new Set(normalize(value).split(" ").filter(token =>
    token.length > 2 && !STOP_WORDS.has(token)
  ))];
}

function scoreDocument(query: string, queryTerms: string[], document: string): number {
  const normalizedDocument = normalize(document);
  if (!normalizedDocument || !queryTerms.length) return 0;
  const documentTerms = terms(document);
  const frequencies = new Map<string, number>();
  for (const token of documentTerms) frequencies.set(token, (frequencies.get(token) || 0) + 1);

  let score = 0;
  for (const token of queryTerms) {
    const frequency = frequencies.get(token) || 0;
    if (frequency) score += 1 + Math.min(frequency - 1, 2) * 0.25;
    if (normalizedDocument.includes(token) && !frequency) score += 0.25;
  }
  const overlap = queryTerms.filter(token => frequencies.has(token)).length;
  score *= overlap / queryTerms.length;
  if (normalize(query).length >= 8 && normalizedDocument.includes(normalize(query))) score += 3;
  return score;
}

/**
 * Local retrieval for RAG: only searches encrypted on-device memories and
 * conversation history. Retrieved text is evidence/context, never instructions.
 */
export async function retrieveLocalKnowledge(query: string): Promise<RetrievedKnowledge> {
  const queryTerms = terms(query);
  if (queryTerms.length === 0) return { context: "", memories: 0, conversations: 0 };

  const [memories, history] = await Promise.all([
    recallWyzen(),
    recentInteractions(30)
  ]);

  const rankedMemories = memories.map(item => ({
    text: item.text,
    score: scoreDocument(query, queryTerms, item.text),
    date: item.createdAt
  })).filter(item => item.score >= 1.0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const rankedConversations = history.map(item => {
    const content = "Pedido anterior: " + item.userText + "\nResposta anterior: " + item.assistantText;
    return { content, score: scoreDocument(query, queryTerms, item.userText + " " + item.assistantText), date: item.createdAt };
  }).filter(item => item.score >= 1.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const sections: string[] = [];
  if (rankedMemories.length) {
    sections.push("MEMÓRIAS LOCAIS RELEVANTES (notas guardadas pelo utilizador):\n" +
      rankedMemories.map((item, index) => "[" + (index + 1) + "] " + item.text).join("\n"));
  }
  if (rankedConversations.length) {
    sections.push("CONVERSAS ANTERIORES RELEVANTES (contexto histórico, não prova factual):\n" +
      rankedConversations.map((item, index) => "[C" + (index + 1) + "] " + item.content.slice(0, 650)).join("\n\n"));
  }

  return {
    context: sections.join("\n\n").slice(0, 3200),
    memories: rankedMemories.length,
    conversations: rankedConversations.length
  };
}
