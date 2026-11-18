import * as Calendar from "expo-calendar";
import { dailyInteractions, recallWyzen } from "./memory";
import { listTasks } from "./tasks";

const normalize = (value: string) => value.toLocaleLowerCase("pt-PT")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function localDayRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return { start, end };
}

async function readTodayEvents(start: Date, end: Date): Promise<string[]> {
  try {
    const permission = await Calendar.getCalendarPermissionsAsync();
    if (!permission.granted) return [];
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const ids = calendars.map(calendar => calendar.id);
    if (!ids.length) return [];
    const events = await Calendar.getEventsAsync(ids, start, end);
    return events
      .filter(event => !event.allDay)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .slice(0, 8)
      .map(event => {
        const time = new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit" }).format(event.startDate);
        return "- " + time + " · " + event.title;
      });
  } catch {
    // O plano continua disponível mesmo sem acesso ao calendário.
    return [];
  }
}

/** Reconhece apenas pedidos explícitos de organização do dia. */
export function isDailyPlanRequest(input: string): boolean {
  const value = normalize(input.trim());
  return /^(?:wyzen[, ]+)?(?:organiza|planeia|planejar|prepara) (?:o )?(?:meu )?dia$/.test(value) ||
    /^(?:wyzen[, ]+)?(?:plano|planeamento|planejamento) (?:para )?(?:o )?dia$/.test(value) ||
    /^(?:wyzen[, ]+)?o que tenho (?:para fazer )?hoje$/.test(value);
}

/**
 * Constrói um resumo com dados locais reais. Não cria, altera nem elimina
 * tarefas, eventos ou memórias e não envia este contexto para o servidor.
 */
export async function buildDailyPlan(now = new Date()): Promise<string> {
  const { start, end } = localDayRange(now);
  const [tasks, memories, interactions, events] = await Promise.all([
    listTasks(),
    recallWyzen(),
    dailyInteractions(),
    readTodayEvents(start, end)
  ]);

  const pending = tasks.filter(task => !task.completed).slice(0, 8);
  const completed = tasks.filter(task => task.completed).length;
  const lines = [
    "PLANO DO TEU DIA",
    new Intl.DateTimeFormat("pt-PT", { dateStyle: "full" }).format(now),
    "",
    "AGENDA"
  ];

  if (events.length) lines.push(...events);
  else lines.push("- Não encontrei eventos no calendário ou a WYZEN não tem permissão para o consultar.");

  lines.push("", "TAREFAS PENDENTES");
  if (pending.length) lines.push(...pending.map((task, index) => (index + 1) + ". " + task.title));
  else lines.push("- Não tens tarefas pendentes guardadas.");

  lines.push("", "PROGRESSO", "- " + completed + " tarefa(s) concluída(s).");
  lines.push("", "MEMÓRIA ÚTIL");
  const usefulMemories = memories.slice(0, 3);
  if (usefulMemories.length) lines.push(...usefulMemories.map(item => "- " + item.text));
  else lines.push("- Ainda não há notas guardadas.");

  lines.push("", "ATIVIDADE DE HOJE", "- " + interactions.length + " interação(ões) guardada(s).");
  lines.push("", "PRÓXIMO PASSO SUGERIDO");
  if (events.length) lines.push("- Confirma o primeiro compromisso e reserva tempo para uma tarefa pendente.");
  else if (pending.length) lines.push("- Escolhe uma tarefa pendente e começa por ela; não há compromissos confirmados no calendário.");
  else lines.push("- Define uma prioridade para hoje. Não encontrei tarefas pendentes nem eventos acessíveis.");

  return lines.join("\n");
}
