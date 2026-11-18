import { secureLocalStorage } from "./secureLocalStorage";

const KEY = "wyzen.mission.active.v1";

export type MissionStep = {
  command: string;
  status: "pending" | "running" | "completed" | "failed" | "uncertain";
  error?: string;
  attempts?: number;
  startedAt?: string;
  finishedAt?: string;
};

export type MissionRecord = {
  id: string;
  title: string;
  steps: MissionStep[];
  nextStep: number;
  status: "active" | "completed" | "interrupted";
  createdAt: string;
  updatedAt: string;
};

async function save(mission: MissionRecord): Promise<void> {
  const serialized = JSON.stringify(mission);
  await secureLocalStorage.setItem(KEY, serialized);
  const persisted = await secureLocalStorage.getItem(KEY);
  if (persisted !== serialized) {
    throw new Error("Não consegui confirmar a gravação do progresso da missão.");
  }
}

export async function getActiveMission(): Promise<MissionRecord | null> {
  const raw = await secureLocalStorage.getItem(KEY);
  if (!raw) return null;
  let value: MissionRecord;
  try {
    value = JSON.parse(raw) as MissionRecord;
  } catch {
    throw new Error("O progresso da missão está ilegível. Foi preservado; não vou substituí-lo automaticamente.");
  }
  const valid = value && typeof value.id === "string" && value.id.length > 0 &&
    typeof value.title === "string" &&
    Array.isArray(value.steps) && value.steps.length > 0 && value.steps.length <= 12 &&
    value.steps.every((step: any) =>
      step && typeof step.command === "string" && step.command.trim().length > 0 &&
      step.command.length <= 500 &&
      ["pending", "running", "completed", "failed", "uncertain"].includes(step.status) &&
      (step.attempts === undefined || (Number.isInteger(step.attempts) && step.attempts >= 0))
    ) &&
    Number.isInteger(value.nextStep) && value.nextStep >= 0 && value.nextStep <= value.steps.length &&
    ["active", "completed", "interrupted"].includes(value.status) &&
    typeof value.createdAt === "string" && !Number.isNaN(Date.parse(value.createdAt)) &&
    typeof value.updatedAt === "string" && !Number.isNaN(Date.parse(value.updatedAt));
  if (!valid) {
    throw new Error("O progresso guardado da missão tem dados inválidos. Não vou apagá-lo nem iniciar outra missão por cima.");
  }
  const interruptedIndex = value.steps.findIndex((step: MissionStep) => step.status === "running");
  if (interruptedIndex >= 0) {
    value.steps[interruptedIndex] = {
      ...value.steps[interruptedIndex],
      status: "uncertain",
      error: "A aplicação foi encerrada durante esta etapa. Confirma o resultado antes de continuar."
    };
    value.nextStep = interruptedIndex;
    value.status = "interrupted";
    value.updatedAt = new Date().toISOString();
    await save(value);
  }
  return value;
}

export async function startMission(commands: string[]): Promise<MissionRecord> {
  if (!commands.length || commands.length > 12) throw new Error("A missão deve conter entre 1 e 12 etapas.");
  if (commands.some(command => typeof command !== "string" || !command.trim() || command.trim().length > 500)) {
    throw new Error("Cada etapa deve conter um comando válido com até 500 caracteres.");
  }
  const existing = await getActiveMission();
  if (existing && existing.status !== "completed") {
    throw new Error("Já existe uma missão por concluir. Retoma-a ou resolve a etapa incerta antes de iniciar outra.");
  }
  const now = new Date().toISOString();
  const mission: MissionRecord = {
    id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8),
    title: "Missão WYZEN",
    steps: commands.map(command => ({ command, status: "pending" })),
    nextStep: 0,
    status: "active",
    createdAt: now,
    updatedAt: now
  };
  await save(mission);
  return mission;
}

export async function updateMissionStep(
  missionId: string,
  index: number,
  status: MissionStep["status"],
  error?: string
): Promise<MissionRecord | null> {
  const mission = await getActiveMission();
  if (!mission || mission.id !== missionId || index < 0 || index >= mission.steps.length) return null;
  const current = mission.steps[index].status;
  if (current === "completed" && status !== "completed") {
    throw new Error("Uma etapa concluída não pode ser reaberta sem criar uma nova missão.");
  }
  if (status === "completed" && current !== "running" && current !== "completed") {
    throw new Error("A etapa só pode ser concluída depois de estar em execução.");
  }
  if ((status === "failed" || status === "uncertain") && current !== "running" && current !== status) {
    throw new Error("Só é possível registar falha ou incerteza numa etapa em execução.");
  }
  const now = new Date().toISOString();
  const previous = mission.steps[index];
  mission.steps[index] = {
    command: previous.command,
    status,
    attempts: (previous.attempts || 0) + (status === "running" ? 1 : 0),
    ...(status === "running" ? { startedAt: now } : previous.startedAt ? { startedAt: previous.startedAt } : {}),
    ...(["completed", "failed", "uncertain"].includes(status) ? { finishedAt: now } : {}),
    ...(error ? { error: error.slice(0, 300) } : {})
  };
  mission.nextStep = mission.steps.findIndex(step => step.status !== "completed");
  if (mission.nextStep < 0) mission.nextStep = mission.steps.length;
  mission.status = status === "failed" || status === "uncertain" ? "interrupted" : "active";
  mission.updatedAt = new Date().toISOString();
  await save(mission);
  return mission;
}

/** Resolve an uncertain step only after the user has checked its real-world result. */
export async function resolveUncertainMissionStep(
  missionId: string,
  index: number,
  resolution: "completed" | "retry"
): Promise<MissionRecord | null> {
  const mission = await getActiveMission();
  if (!mission || mission.id !== missionId || index < 0 || index >= mission.steps.length) return null;
  if (mission.steps[index].status !== "uncertain") {
    throw new Error("A etapa indicada não está marcada como incerta.");
  }
  mission.steps[index] = {
    command: mission.steps[index].command,
    status: resolution === "completed" ? "completed" : "pending",
    attempts: mission.steps[index].attempts || 0,
    ...(resolution === "completed" ? { finishedAt: new Date().toISOString() } : {})
  };
  mission.nextStep = mission.steps.findIndex(step => step.status !== "completed");
  if (mission.nextStep < 0) mission.nextStep = mission.steps.length;
  mission.status = "active";
  mission.updatedAt = new Date().toISOString();
  await save(mission);
  return mission;
}

export async function finishMission(missionId: string): Promise<MissionRecord | null> {
  const mission = await getActiveMission();
  if (!mission || mission.id !== missionId) return null;
  if (!mission.steps.every(step => step.status === "completed")) {
    throw new Error("A missão não pode terminar: ainda existem etapas por confirmar.");
  }
  mission.nextStep = mission.steps.length;
  mission.status = "completed";
  mission.updatedAt = new Date().toISOString();
  await save(mission);
  return mission;
}

export async function interruptMission(missionId: string): Promise<MissionRecord | null> {
  const mission = await getActiveMission();
  if (!mission || mission.id !== missionId) return null;
  mission.status = "interrupted";
  mission.updatedAt = new Date().toISOString();
  await save(mission);
  return mission;
}

export async function clearMission(): Promise<void> {
  await secureLocalStorage.removeItem(KEY);
}
