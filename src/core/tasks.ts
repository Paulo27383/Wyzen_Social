import AsyncStorage from "@react-native-async-storage/async-storage";

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

export async function addTask(title: string): Promise<WyzenTask> {
  const clean = title.trim();
  if (!clean) throw new Error("Indica o nome da tarefa.");
  const tasks = await readTasks();
  const task = { id: String(Date.now()), title: clean, createdAt: new Date().toISOString(), completed: false };
  tasks.unshift(task);
  await writeTasks(tasks.slice(0, 500));
  return task;
}

export async function listTasks(): Promise<WyzenTask[]> {
  return readTasks();
}

export async function completeTask(query: string): Promise<WyzenTask | null> {
  const tasks = await readTasks();
  const q = query.trim().toLocaleLowerCase("pt-PT");
  const index = tasks.findIndex(task => task.id === q || task.title.toLocaleLowerCase("pt-PT").includes(q));
  if (index < 0) return null;
  tasks[index].completed = true;
  await writeTasks(tasks);
  return tasks[index];
}

export async function deleteTask(query: string): Promise<boolean> {
  const tasks = await readTasks();
  const q = query.trim().toLocaleLowerCase("pt-PT");
  const next = tasks.filter(task => task.id !== q && !task.title.toLocaleLowerCase("pt-PT").includes(q));
  if (next.length === tasks.length) return false;
  await writeTasks(next);
  return true;
}
