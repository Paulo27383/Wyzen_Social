import { secureLocalStorage } from "./secureLocalStorage";

const PROFILE_KEY = "wyzen.owner.profile.v1";

export type OwnerProfile = {
  displayName: string;
  role: string;
  ageYears: number | null;
  course: string | null;
  residence: string | null;
  motherName: string | null;
  preferredAddress: string;
  language: string;
  tone: string;
};

const DEFAULT_PROFILE: OwnerProfile = {
  displayName: "Podolsky",
  role: "criador e proprietário da WYZEN AI",
  ageYears: 16,
  course: "curso técnico de Enfermagem Geral",
  residence: null,
  motherName: null,
  preferredAddress: "Podolsky",
  language: "português",
  tone: "sincero, respeitoso, descontraído e natural"
};

export async function getOwnerProfile(): Promise<OwnerProfile> {
  try {
    const raw = await secureLocalStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const saved = JSON.parse(raw) as Partial<OwnerProfile>;
    return { ...DEFAULT_PROFILE, ...saved };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export async function updateOwnerProfile(
  changes: Partial<OwnerProfile>
): Promise<OwnerProfile> {
  const current = await getOwnerProfile();
  const next = { ...current, ...changes };
  if (next.ageYears !== null && (!Number.isInteger(next.ageYears) || next.ageYears < 1 || next.ageYears > 120)) {
    throw new Error("A idade indicada não é válida.");
  }
  await secureLocalStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  return next;
}

/** Store only clear, explicit facts; never infer a personal detail. */
export async function learnOwnerFact(statement: string): Promise<boolean> {
  const value = statement.trim();
  if (!value) return false;
  let match = value.match(/\btenho\s+(\d{1,3})\s+anos\b/i);
  if (match) {
    await updateOwnerProfile({ ageYears: Number(match[1]) });
    return true;
  }
  match = value.match(/\b(?:moro|vivo|resido)\s+(?:em|no|na)\s+(.{2,80})$/i);
  if (match) {
    await updateOwnerProfile({ residence: match[1].trim().replace(/[.!?]+$/, "") });
    return true;
  }
  match = value.match(/\b(?:a minha|minha) mãe chama-se\s+([\p{L}][\p{L} .'-]{1,60})$/iu);
  if (match) {
    await updateOwnerProfile({ motherName: match[1].trim() });
    return true;
  }
  match = value.match(/\b(?:podes chamar-me|chama-me|prefiro que me chames)\s+([\p{L}][\p{L} .'-]{1,40})$/iu);
  if (match) {
    await updateOwnerProfile({ preferredAddress: match[1].trim(), displayName: match[1].trim() });
    return true;
  }
  return false;
}

export async function answerOwnerProfile(question: string): Promise<string> {
  const profile = await getOwnerProfile();
  const value = question.toLocaleLowerCase("pt-PT").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const name = profile.displayName || "Podolsky";

  if (/\b(?:quantos anos|qual a minha idade)\b/.test(value)) {
    return profile.ageYears === null
      ? "Podolsky, ainda não tenho a tua idade confirmada. Se me disseres, guardo-a no teu perfil."
      : `${name}, tenho registado que tens ${profile.ageYears} anos. Se isso mudou ou estiver errado, corrige-me e atualizo o teu perfil.`;
  }
  if (/\b(?:onde vivo|onde moro|onde resido|qual e a minha residencia)\b/.test(value)) {
    return profile.residence
      ? `${name}, tenho registado que vives em ${profile.residence}.`
      : `${name}, ainda não me disseste onde vives. Se quiseres, posso guardar essa informação.`;
  }
  if (/\b(?:minha mae|quem e a minha mae|nome da minha mae)\b/.test(value)) {
    return profile.motherName
      ? `${name}, tenho registado que a tua mãe se chama ${profile.motherName}.`
      : `${name}, ainda não tenho o nome da tua mãe guardado. Podes dizer-mo quando quiseres.`;
  }

  const facts = [
    `És ${name}, meu ${profile.role}.`,
    profile.ageYears === null ? null : `Tenho registado que tens ${profile.ageYears} anos.`,
    profile.course ? `Estás a frequentar o ${profile.course}.` : null,
    profile.residence ? `Vives em ${profile.residence}.` : null,
    profile.motherName ? `A tua mãe chama-se ${profile.motherName}.` : null
  ].filter(Boolean);
  return facts.join(" ") + " Ainda não tenho outros dados pessoais confirmados, e prefiro perguntar-te a inventar.";
}

export function answerWyzenIdentity(question: string): string {
  const value = question.toLocaleLowerCase("pt-PT").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/o que (?:sou|significo) para ti/.test(value) || /o que es para mim/.test(value) || /qual e a nossa relacao/.test(value)) {
    return "És o meu criador e proprietário, Podolsky. Sou a WYZEN AI, a tua assistente pessoal: devo ajudar-te, respeitar as tuas preferências, ser sincera e dizer claramente quando não sei ou não consigo fazer alguma coisa.";
  }
  return "Sou a WYZEN AI, a tua assistente pessoal, criada por ti, Podolsky. O meu papel é conversar contigo, ajudar a organizar a tua vida, responder às tuas perguntas e executar ações no telemóvel quando tenho essa capacidade e as permissões necessárias.";
}
