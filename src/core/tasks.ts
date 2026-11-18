import { secureLocalStorage as AsyncStorage } from "./secureLocalStorage";

const KEY = "wyzen.tasks.v1";
export type WyzenTask = { id: string; title: string; createdAt: string; completed: boolean; priority?: "low" | "normal" | "high" };

async function readTasks(): Promise<WyzenTask[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Os dados das tarefas estão ilegíveis. Não vou substituí-los automaticamente para evitar perda de informação.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("O formato das tarefas guardadas é inválido. Os dados foram preservados para recuperação.");
  }
  const valid = parsed.every((task: any) =>
    task && typeof task.id === "string" && task.id.length > 0 &&
    typeof task.title === "string" && task.title.trim().length > 0 &&
    typeof task.createdAt === "string" && !Number.isNaN(Date.parse(task.createdAt)) &&
    typeof task.completed === "boolean" &&
    (task.priority === undefined || ["low", "normal", "high"].includes(task.priority))
  );
  if (!valid) {
    throw new Error("Existem tarefas com dados inválidos. Não vou descartar registos automaticamente.");
  }
  return parsed as WyzenTask[];
}

async function writeTasks(tasks: WyzenTask[]): Promise<void> {
  const serialized = JSON.stringify(tasks);
  await AsyncStorage.setItem(KEY, serialized);
  const persisted = await AsyncStorage.getItem(KEY);
  if (persisted !== serialized) {
    throw new Error("A gravação das tarefas não foi confirmada pelo armazenamento.");
  }
}

function findTaskIndex(tasks: WyzenTask[], query: string): number {
  const q = query.trim().toLocaleLowerCase("pt-PT");
  if (!q) throw new Error("Indica o nome ou identificador da tarefa.");
  const byId = tasks.findIndex(task => task.id === q);
  if (byId >= 0) return byId;
  const exactMatches = tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.title.trim().toLocaleLowerCase("pt-PT") === q);
  if (exactMatches.length === 1) return exactMatches[0].index;
  if (exactMatches.length > 1) {
    throw new Error("Existem várias tarefas com esse título. Consulta a lista e identifica a tarefa pretendida.");
  }
  const matches = tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.title.toLocaleLowerCase("pt-PT").includes(q));
  if (matches.length > 1) {
    throw new Error("Encontrei várias tarefas semelhantes. Escreve o título completo da tarefa para evitar alterar a tarefa errada.");
  }
  return matches.length === 1 ? matches[0].index : -1;
}

export async function addTask(title: string, priority: "low" | "normal" | "high" = "normal"): Promise<WyzenTask> {
  const clean = title.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("Indica o nome da tarefa.");
  if (clean.length > 180) throw new Error("O título da tarefa deve ter no máximo 180 caracteres.");
  const tasks = await readTasks();
  const duplicate = tasks.find(task => !task.completed && task.title.trim().toLocaleLowerCase("pt-PT") === clean.toLocaleLowerCase("pt-PT"));
  if (duplicate) return duplicate;
  const task = {
    id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8),
    title: clean,
    createdAt: new Date().toISOString(),
    completed: false,
    priority
  };
  tasks.unshift(task);
  await writeTasks(tasks.slice(0, 500));
  const persisted = await readTasks();
  if (!persisted.some(item => item.id === task.id && item.title === task.title && !item.completed)) {
    throw new Error("A tarefa foi preparada, mas não consegui confirmar a gravação no dispositivo.");
  }
  return task;
}

export async function listTasks(): Promise<WyzenTask[]> {
  const rank = { high: 0, normal: 1, low: 2 };
  return (await readTasks()).sort((a, b) =>
    (rank[a.priority || "normal"] - rank[b.priority || "normal"]) ||
    (a.createdAt.localeCompare(b.createdAt))
  );
}

export async function setTaskPriority(query: string, priority: "low" | "normal" | "high"): Promise<WyzenTask | null> {
  const tasks = await readTasks();
  const index = findTaskIndex(tasks, query);
  if (index < 0) return null;
  tasks[index].priority = priority;
  await writeTasks(tasks);
  const persisted = await readTasks();
  const saved = persisted.find(task => task.id === tasks[index].id);
  if (!saved || (saved.priority || "normal") !== priority) {
    throw new Error("Não consegui confirmar a prioridade no dispositivo.");
  }
  return saved;
}

export async function completeTask(query: string): Promise<WyzenTask | null> {
  const tasks = await readTasks();
  const index = findTaskIndex(tasks, query);
  if (index < 0) return null;
  tasks[index].completed = true;
  await writeTasks(tasks);
  const persisted = await readTasks();
  const saved = persisted.find(task => task.id === tasks[index].id);
  if (!saved?.completed) throw new Error("Não consegui confirmar a conclusão da tarefa no dispositivo.");
  return saved;
}

export async function deleteTask(query: string): Promise<boolean> {
  const tasks = await readTasks();
  const index = findTaskIndex(tasks, query);
  if (index < 0) return false;
  const removedId = tasks[index].id;
  tasks.splice(index, 1);
  await writeTasks(tasks);
  const persisted = await readTasks();
  if (persisted.some(task => task.id === removedId)) throw new Error("Não consegui confirmar a remoção da tarefa no dispositivo.");
  return true;
}
