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
  filtered.unshift({ id: String(Date.now()), text: value, createdAt: new Date().toISOString() });
  await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(filtered.slice(0, 300)));
}

export async function recallWyzen(query = ""): Promise<MemoryItem[]> {
  const items = await readAll();
  const q = query.trim().toLocaleLowerCase("pt-PT");
  if (!q) return items.slice(0, 20);
  const terms = q.split(/\\s+/).filter(Boolean);
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
  return items.slice(0, 12).map(item => "- " + item.text).join("\\n");
}
