import { secureLocalStorage } from "./secureLocalStorage";

const KEY = "wyzen.mission.active.v1";

export type MissionStep = {
  command: string;
  status: "pending" | "running" | "completed" | "failed";
  error?: string;
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
  await secureLocalStorage.setItem(KEY, JSON.stringify(mission));
}

export async function getActiveMission(): Promise<MissionRecord | null> {
  try {
    const raw = await secureLocalStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as MissionRecord;
    if (!value || !Array.isArray(value.steps) || !value.steps.length) return null;
    return value;
  } catch {
    return null;
  }
}

export async function startMission(commands: string[]): Promise<MissionRecord> {
  if (!commands.length) throw new Error("A missão não tem etapas.");
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
  if (status === "failed" && current !== "running" && current !== "failed") {
    throw new Error("Só é possível registar falha numa etapa em execução.");
  }
  mission.steps[index] = { command: mission.steps[index].command, status, ...(error ? { error: error.slice(0, 300) } : {}) };
  mission.nextStep = mission.steps.findIndex(step => step.status !== "completed");
  if (mission.nextStep < 0) mission.nextStep = mission.steps.length;
  mission.status = status === "failed" ? "interrupted" : "active";
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
