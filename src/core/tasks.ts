import { secureLocalStorage as AsyncStorage } from "./secureLocalStorage";

const KEY = "wyzen.tasks.v1";
export type WyzenTask = { id: string; title: string; createdAt: string; completed: boolean };

async function readTasks(): Promise<WyzenTask[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function writeTasks(tasks: WyzenTask[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(tasks));
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

export async function addTask(title: string): Promise<WyzenTask> {
  const clean = title.trim();
  if (!clean) throw new Error("Indica o nome da tarefa.");
  const tasks = await readTasks();
  const task = {
    id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8),
    title: clean,
    createdAt: new Date().toISOString(),
    completed: false
  };
  tasks.unshift(task);
  await writeTasks(tasks.slice(0, 500));
  return task;
}

export async function listTasks(): Promise<WyzenTask[]> {
  return readTasks();
}

export async function completeTask(query: string): Promise<WyzenTask | null> {
  const tasks = await readTasks();
  const index = findTaskIndex(tasks, query);
  if (index < 0) return null;
  tasks[index].completed = true;
  await writeTasks(tasks);
  return tasks[index];
}

export async function deleteTask(query: string): Promise<boolean> {
  const tasks = await readTasks();
  const index = findTaskIndex(tasks, query);
  if (index < 0) return false;
  tasks.splice(index, 1);
  await writeTasks(tasks);
  return true;
}
