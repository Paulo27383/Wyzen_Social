export type KnowledgeSource = {
  title: string;
  extract: string;
  url: string;
  language: "pt" | "en" | "unknown";
  provider: "Tavily" | "Wikipedia";
};

type WikiPage = {
  title?: string;
  extract?: string;
  fullurl?: string;
};

type TavilyResult = { title?: string; url?: string; content?: string; published_date?: string };
type TavilyResponse = { results?: TavilyResult[]; error?: string };

type WikiResponse = {
  query?: { pages?: WikiPage[] };
  error?: { info?: string };
};

const SEARCH_TIMEOUT_MS = 12000;
const MAX_RESULTS = 5;
const MAX_EXTRACT_CHARS = 1200;

function shouldSearchKnowledge(raw: string): boolean {
  const value = raw.trim().toLocaleLowerCase("pt-PT").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!value || value.length < 8) return false;

  const explicitSearch = /\b(pesquisa|pesquisar|procura na internet|procura fontes|busca na internet|consulta fontes|investiga|faz uma pesquisa)\b/.test(value);
  const changingFacts = /\b(atual|atualmente|hoje|agora|recente|recentes|ultimas noticias|populacao|eleicoes|presidente atual|primeiro ministro|resultado eleitoral|taxa de cambio|preco atual)\b/.test(value);
  const factualLookup = /^(?:o que e|quem e|quem foi|onde fica|quando foi|qual e a populacao|quantos habitantes|como funciona)\b/.test(value);

  return explicitSearch || changingFacts || factualLookup;
}

async function requestTavily(query: string): Promise<KnowledgeSource[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  const normalized = query.toLocaleLowerCase("pt-PT");
  const topic = /\b(hoje|agora|noticia|noticias|ultima|ultimas|recente|recentes|eleicao|eleicoes)\b/.test(normalized)
    ? "news"
    : "general";
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        topic,
        max_results: MAX_RESULTS,
        include_answer: false,
        include_raw_content: false
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error("O motor de pesquisa respondeu com estado " + response.status + ".");
    const payload = await response.json() as TavilyResponse;
    if (payload.error) throw new Error(payload.error);
    return (payload.results || [])
      .filter(item => typeof item.title === "string" && typeof item.url === "string" && typeof item.content === "string")
      .slice(0, MAX_RESULTS)
      .map(item => ({
        title: (item.title || "").trim(),
        extract: (item.content || "").trim().slice(0, MAX_EXTRACT_CHARS),
        url: item.url || "",
        language: "unknown" as const,
        provider: "Tavily" as const
      }))
      .filter(item => item.title && item.url && item.extract);
  } finally {
    clearTimeout(timeout);
  }
}

async function requestWiki(query: string, language: "pt" | "en"): Promise<KnowledgeSource[]> {
  const base = language === "pt" ? "https://pt.wikipedia.org/w/api.php" : "https://en.wikipedia.org/w/api.php";
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "0",
    gsrwhat: "text",
    gsrlimit: String(MAX_RESULTS),
    prop: "extracts|info",
    inprop: "url",
    exintro: "1",
    explaintext: "1",
    exchars: String(MAX_EXTRACT_CHARS),
    format: "json",
    formatversion: "2",
    origin: "*"
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(base + "?" + params.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error("A fonte de conhecimento respondeu com estado " + response.status + ".");
    const payload = await response.json() as WikiResponse;
    if (payload.error) throw new Error(payload.error.info || "A pesquisa na Wikimedia falhou.");

    return (payload.query?.pages || [])
      .filter(page => typeof page.title === "string" && typeof page.extract === "string" && page.extract.trim().length > 80 && typeof page.fullurl === "string")
      .slice(0, MAX_RESULTS)
      .map(page => ({
        title: (page.title || "").trim(),
        extract: (page.extract || "").trim().slice(0, MAX_EXTRACT_CHARS),
        url: page.fullurl || "",
        language,
        provider: "Wikipedia"
      }));
  } finally {
    clearTimeout(timeout);
  }
}

/** Pesquisa apenas quando a pergunta pede pesquisa ou depende de factos atuais/definições. */
export async function searchKnowledge(rawQuery: string): Promise<KnowledgeSource[]> {
  const query = rawQuery.trim().slice(0, 240);
  if (!shouldSearchKnowledge(query)) return [];
  const cleanedQuery = query.replace(/^(?:wyzen[, ]+)?(?:por favor[, ]+)?(?:pesquisa|pesquisar|procura(?: na internet)?|busca(?: na internet)?|investiga|faz uma pesquisa)(?:\\s+(?:sobre|por|na internet))?\\s+/i, "").trim() || query;

  try {
    const webResults = await requestTavily(cleanedQuery);
    if (webResults.length) return webResults;
  } catch {
    // Usa a Wikipédia como alternativa se a pesquisa geral estiver indisponível ou limitada.
  }

  let portuguese: KnowledgeSource[] = [];
  try {
    portuguese = await requestWiki(cleanedQuery, "pt");
  } catch {
    // Se a Wikipédia em português estiver indisponível, tenta a versão inglesa.
  }
  if (portuguese.length >= 2) return portuguese;

  try {
    const english = await requestWiki(cleanedQuery, "en");
    const seen = new Set(portuguese.map(item => item.title.toLocaleLowerCase("en")));
    return [...portuguese, ...english.filter(item => !seen.has(item.title.toLocaleLowerCase("en")))]
      .slice(0, MAX_RESULTS);
  } catch {
    return portuguese;
  }
}

export function buildKnowledgeContext(sources: KnowledgeSource[]): string {
  return sources.slice(0, MAX_RESULTS).map((source, index) =>
    "[" + (index + 1) + "] " + source.title + " (" + source.language + ")\n" +
    source.extract + "\nURL: " + source.url
  ).join("\n\n").slice(0, 5600);
}

export function formatKnowledgeFallback(sources: KnowledgeSource[]): string {
  const excerpts = sources.slice(0, 3).map((source, index) =>
    (index + 1) + ". " + source.title + "\n" + source.extract + "\nFonte: " + source.url
  );
  return "Encontrei estas páginas na Wikimedia. Ainda não consegui gerar uma síntese com o modelo local, por isso apresento os excertos sem os tratar como uma resposta verificada:\n\n" +
    excerpts.join("\n\n");
}
