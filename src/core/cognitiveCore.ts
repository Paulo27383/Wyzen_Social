import { secureLocalStorage } from "./secureLocalStorage";
import { addTask, listTasks } from "./tasks";

const LEARNING_KEY = "wyzen.learning.explicit.v1";
const OUTCOME_KEY = "wyzen.core.outcomes.v1";

export type LearningRecord = {
  id: string;
  correction: string;
  createdAt: string;
  source: "explicit_user_correction";
  status: "accepted";
};

export type CoreOutcome = {
  id: string;
  capability: string;
  result: "success" | "failure" | "uncertain";
  detail: string;
  createdAt: string;
};


export type PlanReview = {
  approved: boolean;
  confidence: "high" | "medium" | "low";
  warnings: string[];
};

/** A single-core preflight: checks clarity and risk before a compound mission. */
export function reviewExecutionPlan(commands: string[]): PlanReview {
  const warnings: string[] = [];
  if (!commands.length || commands.length > 12) {
    return { approved: false, confidence: "low", warnings: ["O plano está vazio ou excede o limite de 12 etapas."] };
  }
  if (commands.some(command => !command.trim() || command.trim().length > 500)) {
    return { approved: false, confidence: "low", warnings: ["Existe uma etapa vazia ou demasiado longa."] };
  }
  const normalized = commands.map(command => command.trim().toLocaleLowerCase("pt-PT"));
  if (new Set(normalized).size !== normalized.length) {
    warnings.push("O plano contém etapas repetidas; revê a sequência antes de executar.");
    return { approved: false, confidence: "low", warnings };
  }
  const sensitive = /\b(enviar|apagar|eliminar|remover|comprar|pagar|publicar|partilhar|instalar|desinstalar|transferir dinheiro|transferência|transferencia|chamada|telefonar|liga para|sms|mensagem|autorizar|autoriza)\b/i;
  if (commands.some(command => sensitive.test(command))) {
    return { approved: false, confidence: "low", warnings: ["O plano contém uma ação sensível que deve ser executada separadamente, com confirmação própria."] };
  }
  return { approved: true, confidence: commands.length <= 4 ? "high" : "medium", warnings };
}

export type CoreAssessment = {
  total: number;
  successful: number;
  failed: number;
  uncertain: number;
  successRate: number | null;
  recent: CoreOutcome[];
  learningCount: number;
  pendingTasks: number;
};

async function readArray<T>(key: string): Promise<T[]> {
  try {
    const raw = await secureLocalStorage.getItem(key);
    if (!raw) return [];
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

async function writeBounded<T>(key: string, items: T[], limit: number): Promise<void> {
  await secureLocalStorage.setItem(key, JSON.stringify(items.slice(0, limit)));
}

/**
 * One shared WYZEN cognition state: explicit corrections and verified outcomes.
 * This records user-approved learning; it does not silently retrain or rewrite
 * the language model, system policy, or application code.
 */
export async function learnFromCorrection(correction: string): Promise<LearningRecord> {
  const clean = correction.trim();
  if (clean.length < 4) throw new Error("Explica a correção com um pouco mais de detalhe.");
  if (clean.length > 600) throw new Error("A correção deve ter no máximo 600 caracteres para manter a memória clara e controlada.");
  const items = await readArray<LearningRecord>(LEARNING_KEY);
  const normalized = clean.toLocaleLowerCase("pt-PT");
  const existing = items.find(item => item.correction.trim().toLocaleLowerCase("pt-PT") === normalized);
  if (existing) return existing;
  const record: LearningRecord = {
    id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8),
    correction: clean,
    createdAt: new Date().toISOString(),
    source: "explicit_user_correction",
    status: "accepted"
  };
  await writeBounded(LEARNING_KEY, [record, ...items], 300);
  return record;
}

export async function forgetExplicitLearning(query: string): Promise<number> {
  const items = await readArray<LearningRecord>(LEARNING_KEY);
  const clean = query.trim().toLocaleLowerCase("pt-PT");
  if (!clean) {
    await secureLocalStorage.removeItem(LEARNING_KEY);
    return items.length;
  }
  const kept = items.filter(item => !item.correction.toLocaleLowerCase("pt-PT").includes(clean));
  await writeBounded(LEARNING_KEY, kept, 300);
  return items.length - kept.length;
}

export async function getExplicitLearning(): Promise<LearningRecord[]> {
  return (await readArray<LearningRecord>(LEARNING_KEY)).slice(0, 30);
}

export async function recordCoreOutcome(
  capability: string,
  result: CoreOutcome["result"],
  detail: string
): Promise<void> {
  const items = await readArray<CoreOutcome>(OUTCOME_KEY);
  const record: CoreOutcome = {
    id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8),
    capability: capability.trim().slice(0, 60) || "núcleo",
    result,
    detail: detail.trim().slice(0, 240),
    createdAt: new Date().toISOString()
  };
  await writeBounded(OUTCOME_KEY, [record, ...items], 500);
}

export async function assessCore(): Promise<CoreAssessment> {
  const [outcomes, learning, tasks] = await Promise.all([
    readArray<CoreOutcome>(OUTCOME_KEY),
    readArray<LearningRecord>(LEARNING_KEY),
    listTasks()
  ]);
  const successful = outcomes.filter(item => item.result === "success").length;
  const failed = outcomes.filter(item => item.result === "failure").length;
  const uncertain = outcomes.filter(item => item.result === "uncertain").length;
  const total = outcomes.length;
  return {
    total, successful, failed, uncertain,
    successRate: total ? Math.round(successful / total * 100) : null,
    recent: outcomes.slice(0, 8),
    learningCount: learning.length,
    pendingTasks: tasks.filter(task => !task.completed).length
  };
}

/**
 * Initiative is advisory only: it proposes next steps from the user's own
 * pending tasks and never launches external actions without confirmation.
 */
export async function prepareInitiative(): Promise<string> {
  const tasks = (await listTasks()).filter(task => !task.completed).slice(0, 5);
  if (!tasks.length) return "Não encontrei tarefas pendentes. Se quiseres, diz-me o próximo objetivo e organizo-o contigo.";
  return "Encontrei " + tasks.length + " tarefa(s) pendente(s):\n" +
    tasks.map((task, index) => (index + 1) + ". " + task.title).join("\n") +
    "\nPosso ajudar a definir prioridades e preparar os próximos passos. Não executei nenhuma ação externa.";
}

export async function acceptGoalAsTask(goal: string): Promise<string> {
  const task = await addTask(goal);
  await recordCoreOutcome("planeamento", "success", "Objetivo registado como tarefa: " + task.title);
  return "Objetivo integrado no plano: " + task.title;
}
