import AsyncStorage from "@react-native-async-storage/async-storage";

const MEMORY_KEY = "wyzen.memory.v1";
export type MemoryItem = { id: string; text: string; createdAt: string };

async function readAll(): Promise<MemoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(MEMORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MemoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function rememberWyzen(text: string): Promise<void> {
  const value = text.trim();
  if (!value) throw new Error("Não há informação para guardar.");
  const items = await readAll();
  const normalized = value.toLocaleLowerCase("pt-PT");
  const filtered = items.filter(item => item.text.toLocaleLowerCase("pt-PT") !== normalized);
  filtered.unshift({ id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8), text: value, createdAt: new Date().toISOString() });
  await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(filtered.slice(0, 300)));
}

export async function recallWyzen(query = ""): Promise<MemoryItem[]> {
  const items = await readAll();
  const q = query.trim().toLocaleLowerCase("pt-PT");
  if (!q) return items.slice(0, 20);
  const terms = q.split(" ").filter(Boolean);
  return items.filter(item => terms.some(term => item.text.toLocaleLowerCase("pt-PT").includes(term))).slice(0, 20);
}

export async function forgetWyzen(query: string): Promise<number> {
  const items = await readAll();
  const q = query.trim().toLocaleLowerCase("pt-PT");
  if (!q) {
    await AsyncStorage.removeItem(MEMORY_KEY);
    return items.length;
  }
  const kept = items.filter(item => !item.text.toLocaleLowerCase("pt-PT").includes(q));
  await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(kept));
  return items.length - kept.length;
}

export async function memoryContext(): Promise<string> {
  const items = await readAll();
  return items.slice(0, 12).map(item => "- " + item.text).join(String.fromCharCode(10));
}


export type DailyInteraction = { id: string; kind: "conversation" | "advice" | "summary"; userText: string; assistantText: string; createdAt: string };
const HISTORY_KEY = "wyzen.daily.history.v1";
async function readHistory(): Promise<DailyInteraction[]> {
  try { const raw = await AsyncStorage.getItem(HISTORY_KEY); if (!raw) return []; const parsed = JSON.parse(raw) as DailyInteraction[]; return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
export async function recordInteraction(userText: string, assistantText: string, kind: DailyInteraction["kind"] = "conversation"): Promise<void> {
  const user = userText.trim(); const answer = assistantText.trim(); if (!user || !answer) return;
  const history = await readHistory();
  history.unshift({ id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8), kind, userText: user, assistantText: answer, createdAt: new Date().toISOString() });
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 500)));
}
export async function dailyInteractions(): Promise<DailyInteraction[]> {
  // Use the device's local calendar day, not UTC, so late-night interactions
  // are not assigned to the wrong day in different time zones.
  const localDay = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
  const today = localDay(new Date());
  return (await readHistory()).filter(item => {
    const created = new Date(item.createdAt);
    return !Number.isNaN(created.getTime()) && localDay(created) === today;
  }).slice(0, 30);
}


/** Recent local conversation history across days, newest first. */
export async function recentInteractions(days = 7): Promise<DailyInteraction[]> {
  const safeDays = Math.max(1, Math.min(30, Math.floor(days) || 7));
  const cutoff = Date.now() - safeDays * 24 * 60 * 60 * 1000;
  return (await readHistory())
    .filter(item => {
      const timestamp = new Date(item.createdAt).getTime();
      return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= Date.now();
    })
    .slice(0, 60);
}
