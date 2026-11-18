export type KnowledgeSource = {
  title: string;
  extract: string;
  url: string;
  language: "pt" | "en" | "unknown";
  provider: "Tavily" | "Wikipedia" | "OMS" | "Banco Mundial";
};

type WikiPage = { title?: string; extract?: string; fullurl?: string };
type WikiResponse = { query?: { pages?: WikiPage[] }; error?: { info?: string } };
type TavilyResult = { title?: string; url?: string; content?: string };
type TavilyResponse = { results?: TavilyResult[]; error?: string };
type WhoIndicator = { IndicatorCode?: string; IndicatorName?: string };
type WhoData = {
  SpatialDim?: string;
  TimeDim?: string | number;
  TimeDimensionBegin?: string;
  NumericValue?: number | string | null;
  Value?: string;
  Dim1?: string;
};
type WhoResponse = { value?: WhoIndicator[] | WhoData[]; error?: { message?: string } };
type WorldBankMeta = { page?: number; pages?: number; total?: number };
type WorldBankRecord = {
  indicator?: { id?: string; value?: string };
  country?: { id?: string; value?: string };
  date?: string;
  value?: number | null;
  unit?: string;
};
type WorldBankResponse = [WorldBankMeta, WorldBankRecord[] | null];

const SEARCH_TIMEOUT_MS = 12000;
const MAX_RESULTS = 5;
const MAX_EXTRACT_CHARS = 1200;
const WHO_BASE = "https://ghoapi.azureedge.net/api";
const WB_BASE = "https://api.worldbank.org/v2";

function normalize(raw: string): string {
  return raw.trim().toLocaleLowerCase("pt-PT").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function shouldSearchKnowledge(raw: string): boolean {
  const value = normalize(raw);
  if (!value || value.length < 8) return false;
  const explicitSearch = /\b(pesquisa|pesquisar|procura na internet|procura fontes|busca na internet|consulta fontes|investiga|faz uma pesquisa)\b/.test(value);
  const changingFacts = /\b(atual|atualmente|hoje|agora|recente|recentes|ultimas noticias|populacao|eleicoes|presidente atual|primeiro ministro|resultado eleitoral|taxa de cambio|preco atual)\b/.test(value);
  const factualLookup = /^(?:o que e|quem e|quem foi|onde fica|quando foi|qual e a populacao|quantos habitantes|como funciona)\b/.test(value);
  const healthQuestion = /\b(saude|doenca|doencas|malaria|paludismo|tuberculose|vih|sida|hiv|vacina|vacinacao|mortalidade|mortalidade infantil|esperanca de vida|enfermagem|epidemia|surto)\b/.test(value);
  const statsQuestion = /\b(pib|economia|desemprego|pobreza|inflacao|populacao|habitantes|crescimento economico|rendimento|produto interno bruto)\b/.test(value);
  return explicitSearch || changingFacts || factualLookup || healthQuestion || statsQuestion;
}

async function fetchJson<T>(url: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error("A fonte respondeu com estado " + response.status + ".");
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestTavily(query: string): Promise<KnowledgeSource[]> {
  const normalized = normalize(query);
  const topic = /\b(hoje|agora|noticia|noticias|ultima|ultimas|recente|recentes|eleicao|eleicoes)\b/.test(normalized) ? "news" : "general";
  const payload = await fetchJson<TavilyResponse>("https://api.tavily.com/search", "POST", {
    query,
    search_depth: "basic",
    topic,
    max_results: MAX_RESULTS,
    include_answer: false,
    include_raw_content: false
  });
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
}

async function requestWiki(query: string, language: "pt" | "en"): Promise<KnowledgeSource[]> {
  const base = language === "pt" ? "https://pt.wikipedia.org/w/api.php" : "https://en.wikipedia.org/w/api.php";
  const params = new URLSearchParams({
    action: "query", generator: "search", gsrsearch: query, gsrnamespace: "0",
    gsrwhat: "text", gsrlimit: String(MAX_RESULTS), prop: "extracts|info",
    inprop: "url", exintro: "1", explaintext: "1", exchars: String(MAX_EXTRACT_CHARS),
    format: "json", formatversion: "2", origin: "*"
  });
  const payload = await fetchJson<WikiResponse>(base + "?" + params.toString());
  if (payload.error) throw new Error(payload.error.info || "A pesquisa na Wikipédia falhou.");
  return (payload.query?.pages || [])
    .filter(page => typeof page.title === "string" && typeof page.extract === "string" && page.extract.trim().length > 80 && typeof page.fullurl === "string")
    .slice(0, MAX_RESULTS)
    .map(page => ({
      title: (page.title || "").trim(),
      extract: (page.extract || "").trim().slice(0, MAX_EXTRACT_CHARS),
      url: page.fullurl || "",
      language,
      provider: "Wikipedia" as const
    }));
}

function countryCode(query: string): string {
  const value = normalize(query);
  const countries: Array<[RegExp, string]> = [
    [/\bangola\b/, "AGO"], [/\bportugal\b/, "PRT"], [/\bmozambique\b/, "MOZ"],
    [/\bcabo verde\b/, "CPV"], [/\bbrasil\b|\bbrazil\b/, "BRA"],
    [/\bnamibia\b/, "NAM"], [/\bafrica do sul\b|\bsouth africa\b/, "ZAF"]
  ];
  return countries.find(([pattern]) => pattern.test(value))?.[1] || "WLD";
}

async function requestWorldBank(query: string): Promise<KnowledgeSource[]> {
  const value = normalize(query);
  const indicators: Array<{ terms: RegExp; code: string; label: string }> = [
    { terms: /\b(populacao|habitantes|demografia)\b/, code: "SP.POP.TOTL", label: "População total" },
    { terms: /\bpib per capita\b|\bproduto interno bruto por habitante\b/, code: "NY.GDP.PCAP.CD", label: "PIB per capita (US$ correntes)" },
    { terms: /\bpib\b|\bproduto interno bruto\b/, code: "NY.GDP.MKTP.CD", label: "PIB (US$ correntes)" },
    { terms: /\bdesemprego\b|\btaxa de desemprego\b/, code: "SL.UEM.TOTL.ZS", label: "Desemprego (% da força de trabalho)" },
    { terms: /\besperanca de vida\b|\blongevidade\b/, code: "SP.DYN.LE00.IN", label: "Esperança de vida à nascença (anos)" },
    { terms: /\bpobreza\b/, code: "SI.POV.DDAY", label: "População abaixo da linha internacional de pobreza (%)" },
    { terms: /\binflacao\b|\bprecos ao consumidor\b/, code: "FP.CPI.TOTL.ZG", label: "Inflação, preços no consumidor (%)" }
  ];
  const selected = indicators.filter(item => item.terms.test(value)).slice(0, 2);
  if (!selected.length) return [];
  const country = countryCode(query);
  const results = await Promise.all(selected.map(async item => {
    const url = WB_BASE + "/country/" + country + "/indicator/" + item.code +
      "?format=json&mrnev=5&per_page=5";
    const payload = await fetchJson<WorldBankResponse>(url);
    const rows = Array.isArray(payload[1]) ? payload[1] : [];
    const latest = rows.find(row => row.value !== null && row.value !== undefined);
    if (!latest) return null;
    const valueText = typeof latest.value === "number"
      ? latest.value.toLocaleString("pt-PT", { maximumFractionDigits: 2 })
      : String(latest.value);
    return {
      title: item.label + " — " + (latest.country?.value || country),
      extract: "Valor: " + valueText + (latest.unit ? " " + latest.unit : "") +
        ". Ano: " + latest.date + ". Indicador: " + item.code +
        ". A API devolveu a observação mais recente disponível; não significa necessariamente que seja do ano corrente.",
      url: "https://data.worldbank.org/indicator/" + item.code + "?locations=" + country,
      language: "pt" as const,
      provider: "Banco Mundial" as const
    };
  }));
  return results.filter((item): item is KnowledgeSource => item !== null);
}

async function requestWho(query: string): Promise<KnowledgeSource[]> {
  const value = normalize(query);
  const terms: Array<[RegExp, string]> = [
    [/\bmalaria\b|\bpaludismo\b/, "malaria"],
    [/\btuberculose\b/, "tuberculosis"],
    [/\b(vih|sida|hiv)\b/, "HIV"],
    [/\b(vacina|vacinacao|imunizacao)\b/, "immunization"],
    [/\b(mortalidade infantil|mortalidade de menores de cinco anos)\b/, "under-five mortality"],
    [/\b(esperanca de vida|longevidade)\b/, "life expectancy"],
    [/\b(mortalidade materna)\b/, "maternal mortality"],
    [/\b(saude|doenca|doencas|epidemia|surto|enfermagem)\b/, "health"]
  ];
  const term = terms.find(([pattern]) => pattern.test(value))?.[1];
  if (!term) return [];
  const metadataUrl = WHO_BASE + "/Indicator?" + new URLSearchParams({
    "$filter": "contains(IndicatorName,'" + term.replace(/'/g, "''") + "')",
    "$top": "4"
  }).toString();
  const metadata = await fetchJson<WhoResponse>(metadataUrl);
  const indicators = (metadata.value || []) as WhoIndicator[];
  const country = countryCode(query);
  const matches = indicators.filter(item => item.IndicatorCode && item.IndicatorName).slice(0, 3);
  const results = await Promise.all(matches.map(async item => {
    const dataUrl = WHO_BASE + "/" + encodeURIComponent(item.IndicatorCode || "") + "?" +
      new URLSearchParams({
        "$filter": "SpatialDim eq '" + country + "'",
        "$orderby": "TimeDimensionBegin desc",
        "$top": "8"
      }).toString();
    const data = await fetchJson<WhoResponse>(dataUrl);
    const rows = ((data.value || []) as WhoData[])
      .filter(row => row.NumericValue !== null && row.NumericValue !== undefined)
      .sort((a, b) => String(b.TimeDimensionBegin || b.TimeDim || "").localeCompare(String(a.TimeDimensionBegin || a.TimeDim || "")));
    const latest = rows[0];
    if (!latest) return null;
    const number = Number(latest.NumericValue);
    const valueText = Number.isFinite(number)
      ? number.toLocaleString("pt-PT", { maximumFractionDigits: 2 })
      : String(latest.Value || latest.NumericValue);
    const year = latest.TimeDim || (latest.TimeDimensionBegin || "").slice(0, 4) || "não indicado";
    return {
      title: (item.IndicatorName || "Indicador de saúde") + " — " + country,
      extract: "Valor publicado: " + valueText + ". Período: " + year +
        ". Indicador OMS: " + item.IndicatorCode + ". A OMS pode publicar estimativas comparáveis que diferem das estatísticas nacionais; confirma a metodologia e o ano na página do indicador.",
      url: WHO_BASE + "/" + encodeURIComponent(item.IndicatorCode || ""),
      language: "en" as const,
      provider: "OMS" as const
    };
  }));
  return results.filter((item): item is KnowledgeSource => item !== null);
}

function cleanQuery(query: string): string {
  return query.replace(/^(?:wyzen[, ]+)?(?:por favor[, ]+)?(?:pesquisa|pesquisar|procura(?: na internet)?|busca(?: na internet)?|investiga|faz uma pesquisa)(?:\s+(?:sobre|por|na internet))?\s+/i, "").trim() || query;
}

/** Combina pesquisa geral com dados estruturados de fontes oficiais, quando a pergunta corresponde a um indicador. */
export async function searchKnowledge(rawQuery: string): Promise<KnowledgeSource[]> {
  const query = rawQuery.trim().slice(0, 240);
  if (!shouldSearchKnowledge(query)) return [];
  const cleanedQuery = cleanQuery(query);
  const [general, who, worldBank] = await Promise.all([
    requestTavily(cleanedQuery).catch(() => [] as KnowledgeSource[]),
    requestWho(cleanedQuery).catch(() => [] as KnowledgeSource[]),
    requestWorldBank(cleanedQuery).catch(() => [] as KnowledgeSource[])
  ]);
  const specialized = [...who, ...worldBank];
  if (specialized.length) return [...specialized, ...general].slice(0, MAX_RESULTS);
  if (general.length) return general.slice(0, MAX_RESULTS);

  let portuguese: KnowledgeSource[] = [];
  try {
    portuguese = await requestWiki(cleanedQuery, "pt");
  } catch {
    // Tenta a versão inglesa abaixo.
  }
  if (portuguese.length >= 2) return portuguese;
  try {
    const english = await requestWiki(cleanedQuery, "en");
    const seen = new Set(portuguese.map(item => item.title.toLocaleLowerCase("en")));
    return [...portuguese, ...english.filter(item => !seen.has(item.title.toLocaleLowerCase("en")))].slice(0, MAX_RESULTS);
  } catch {
    return portuguese;
  }
}

export function buildKnowledgeContext(sources: KnowledgeSource[]): string {
  return sources.slice(0, MAX_RESULTS).map((source, index) =>
    "[" + (index + 1) + "] " + source.title + " (" + source.provider + (source.language === "unknown" ? "" : ", " + source.language) + ")\n" +
    source.extract + "\nURL: " + source.url
  ).join("\n\n").slice(0, 5600);
}

export function formatKnowledgeFallback(sources: KnowledgeSource[]): string {
  const excerpts = sources.slice(0, 3).map((source, index) =>
    (index + 1) + ". " + source.title + " (" + source.provider + ")\n" + source.extract + "\nFonte: " + source.url
  );
  return "Encontrei estes resultados de pesquisa. Ainda não consegui gerar uma síntese com o modelo local, por isso apresento os excertos sem os tratar como uma resposta verificada:\n\n" +
    excerpts.join("\n\n");
}
