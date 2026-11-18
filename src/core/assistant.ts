export type LocalIntent =
  | "greeting" | "creator" | "profile" | "wyzen_identity" | "time" | "date" | "help" | "planning" | "learning" | "unknown";

export type CommandResult = {
  title: string;
  steps: string[];
  requiresConfirmation: boolean;
  status: "planned" | "needs_setup";
  intent?: LocalIntent;
};

const sensitiveTerms = [
  "enviar", "apagar", "eliminar", "comprar", "pagar",
  "publicar", "partilhar", "instalar", "desinstalar"
];

export function classifyLocalIntent(raw: string): LocalIntent {
  const value = raw.trim().toLocaleLowerCase("pt-PT").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(quem sou eu|qual e o meu nome|quantos anos tenho|qual a minha idade|onde vivo|onde moro|onde resido|quem e a minha mae|nome da minha mae|o que sabes sobre mim|fala sobre mim|perfil de podolsky|quem e podolsky)\b/.test(value)) return "profile";
  if (/\b(quem es tu|quem e a wyzen|o que es para mim|o que sou para ti|qual e o teu papel|qual e a nossa relacao)\b/.test(value)) return "wyzen_identity";
  if (/\b(quem (te|a) criou|quem criou voce|quem criou você|quem (te|a) fez|quem e o teu criador|quem e seu criador|quem desenvolveu)\b/.test(value)) return "creator";
  if (/^(ola|olá|oi|bom dia|boa tarde|boa noite|hey)\b/.test(value)) return "greeting";
  if (/\b(que horas|horas sao|hora atual|diz as horas)\b/.test(value)) return "time";
  if (/\b(que dia|data de hoje|dia de hoje|hoje e que dia)\b/.test(value)) return "date";
  if (/^(ajuda|o que sabes fazer|comandos disponiveis|funcoes locais)\b/.test(value)) return "help";
  if (/\b(planear|planejar|organizar|agenda|tarefas|plano|lembrete)\b/.test(value)) return "planning";
  if (/\b(aprender|ensinar|explicar|estudar|treinar)\b/.test(value)) return "learning";
  return "unknown";
}

export function planCommand(raw: string): CommandResult {
  const command = raw.trim();
  const normalized = command.toLocaleLowerCase("pt-PT");
  const sensitive = sensitiveTerms.some(term => normalized.includes(term));
  const intent = classifyLocalIntent(command);

  if (!command) {
    return { title: "Aguardando comando", steps: ["Diz ou escreve o que precisas."], requiresConfirmation: false, status: "planned", intent };
  }

  if (intent === "greeting") {
    return { title: "Saudação", steps: ["Olá! Sou a WYZEN, a tua assistente pessoal.", "Posso ajudar com comandos locais, organização e planeamento."], requiresConfirmation: false, status: "planned", intent };
  }
  if (intent === "creator") {
    return { title: "O meu criador", steps: ["Meu criador é Podolsky Wyzen P e me criou manualmente com GitHub."], requiresConfirmation: false, status: "planned", intent };
  }
  if (intent === "profile") {
    return { title: "Quem é Podolsky Wyzen P", steps: ["Podolsky Wyzen P tem 16 anos, mede 1,70 m e pesa 54 kg.", "Está a frequentar o curso técnico de Enfermagem Geral.", "A sua perspetiva de futuro é unir a Enfermagem Geral à tecnologia e ao empreendedorismo: cuidar de pessoas, desenvolver soluções tecnológicas e criar projetos e negócios com impacto positivo.", "Podolsky é o meu criador e idealizador. Fui concebida para o apoiar nos estudos, na organização e nos seus projetos."], requiresConfirmation: false, status: "planned", intent };
  }
  if (intent === "time") {
    return { title: "Hora atual", steps: [new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit" }).format(new Date())], requiresConfirmation: false, status: "planned", intent };
  }
  if (intent === "date") {
    return { title: "Data de hoje", steps: [new Intl.DateTimeFormat("pt-PT", { dateStyle: "full" }).format(new Date())], requiresConfirmation: false, status: "planned", intent };
  }
  if (intent === "help") {
    return { title: "Funções locais", steps: ["Consultar contactos: “procura contacto + nome”.", "Preparar chamada: “liga para + número”.", "Preparar SMS: “sms para + número: mensagem”.", "Criar lembrete: “lembra-me de + tarefa às HH:MM”.", "Abrir aplicações: “abre WhatsApp”, “abre Maps” ou “abre Gmail”.", "Gerir permissões: “autoriza microfone”, “autoriza contactos”, “autoriza calendário”."], requiresConfirmation: false, status: "planned", intent };
  }

  return {
    title: intent === "unknown" ? "Ainda estou a aprender" : "Plano preparado",
    steps: [
      `Comando recebido: “${command}”`,
      "Identificar o objetivo e dividir o pedido em etapas.",
      "Verificar ferramentas locais e permissões disponíveis.",
      sensitive
        ? "Pedir confirmação explícita antes de qualquer ação sensível."
        : "Não executar ações que ainda não estejam implementadas.",
      "Quando a ligação estiver disponível, enviar pedidos complexos ao servidor WYZEN."
    ],
    requiresConfirmation: sensitive,
    status: "needs_setup",
    intent
  };
}


/**
 * Converts clear natural-language variants into the existing, tested command
 * phrases. Ambiguous requests are deliberately left untouched for conversation.
 */
export function normalizeNaturalCommand(raw: string): string {
  const value = raw.trim().replace(/\s+/g, " ");
  let match: RegExpMatchArray | null;

  // Tasks: create, list, complete and remove.
  match = value.match(/^(?:wyzen[, ]+)?(?:cria|adiciona|regista|acrescenta) (?:uma )?tarefa(?: para| de| chamada)?\s+(.+)$/i);
  if (match) return "cria tarefa " + match[1].trim();
  match = value.match(/^(?:wyzen[, ]+)?(?:marca|assinala|dá como) (?:a )?tarefa (.+?) como (?:concluída|concluida|feita|terminada)$/i);
  if (match) return "conclui tarefa " + match[1].trim();
  match = value.match(/^(?:wyzen[, ]+)?(?:termina|conclui|finaliza) (?:a )?tarefa (.+)$/i);
  if (match) return "conclui tarefa " + match[1].trim();
  match = value.match(/^(?:wyzen[, ]+)?(?:apaga|elimina|remove) (?:a )?tarefa (.+)$/i);
  if (match) return "apaga tarefa " + match[1].trim();
  if (/^(?:wyzen[, ]+)?(?:mostra|lista|consulta|quais são|quais sao) (?:as )?(?:minhas )?tarefas$/i.test(value) ||
      /^(?:wyzen[, ]+)?o que tenho para fazer$/i.test(value)) return "lista tarefas";

  // Personal memory.
  match = value.match(/^(?:wyzen[, ]+)?(?:guarda|memoriza|lembra-te de|não te esqueças de|nao te esquecas de) (?:que\s+)?(.+)$/i);
  if (match) return "guarda na memória " + match[1].trim();
  match = value.match(/^(?:wyzen[, ]+)?(?:o que sabes|o que te lembras) sobre (.+)$/i);
  if (match) return "o que sabes sobre " + match[1].trim();
  match = value.match(/^(?:wyzen[, ]+)?(?:esquece|apaga da memória|remove da memória) (.+)$/i);
  if (match) return "esquece " + match[1].trim();
  if (/^(?:wyzen[, ]+)?(?:mostra|consulta|abre) (?:a )?memória$/i.test(value)) return "consulta a memória";

  // App launch and contacts.
  match = value.match(/^(?:wyzen[, ]+)?(?:abre|abres|inicia|inicias|entra no|entra na) (?:a |o )?(whatsapp|facebook|instagram|tiktok|gmail|google drive|drive|google calendar|calendar|calendário|calendario|maps|google maps|google)$/i);
  if (match) return "abre " + match[1];
  match = value.match(/^(?:wyzen[, ]+)?(?:procura|encontra|pesquisa|localiza) (?:o contacto|a pessoa|contacto chamado|contacto) (.+)$/i);
  if (match) return "procura contacto " + match[1].trim();

  // Calls and SMS are still routed through the existing confirmation flow.
  match = value.match(/^(?:wyzen[, ]+)?(?:faz uma chamada|faz chamada|telefona|liga) (?:para )?(.+)$/i);
  if (match) return "liga para " + match[1].trim();
  match = value.match(/^(?:wyzen[, ]+)?(?:envia|manda|prepara) (?:um )?(?:sms|mensagem) (?:para )?(.+?)\s*[:;,]\s*(.+)$/i);
  if (match) return "sms para " + match[1].trim() + ": " + match[2].trim();

  // Reminder phrasing stays compatible with the current reminder parser.
  match = value.match(/^(?:wyzen[, ]+)?(?:cria|marca|agenda) (?:um )?lembrete (?:para|de)?\s*(.+)$/i);
  if (match && /\b(?:às|as)\s+\d{1,2}[:h]\d{2}\b/i.test(match[1])) return "lembra-me de " + match[1].trim();

  // Conversation remains untouched whenever the intention is not clear.
  return value;
}


export type CompoundCommandPlan = {
  isCompound: boolean;
  steps: string[];
  clarification: string | null;
  supported: boolean;
};

/**
 * Prepara missões compostas entre pesquisa, tarefas e memória.
 * Ações externas/sensíveis ficam fora desta execução em cadeia.
 */
export function planCompoundCommand(raw: string): CompoundCommandPlan {
  const input = raw.trim().replace(/\s+/g, " ");
  const parts = input.split(/\s+(?:e depois|e também|e tambem|e)\s+/i)
    .map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return { isCompound: false, steps: [], clarification: null, supported: false };

  const normalized = parts.map(normalizeNaturalCommand);
  const isTask = (value: string) =>
    /^(?:cria|adiciona|regista) tarefa\s+.+$/i.test(value) ||
    /^(?:lista|mostra|consulta) tarefas$/i.test(value) ||
    /^(?:conclui|termina|marca como feita) tarefa\s+.+$/i.test(value) ||
    /^(?:apaga|elimina|remove) tarefa\s+.+$/i.test(value);
  const isMemoryWrite = (value: string) =>
    /^(?:guarda na memória|memoriza|lembra-te que)\s+.+$/i.test(value);
  const isMemoryRead = (value: string) =>
    /^(?:consulta a memória|o que sabes sobre|o que te lembras sobre)(?:\s+.+)?$/i.test(value);
  const isKnowledgeSearch = (value: string) =>
    /^(?:pesquisa(?:r)?(?: na internet)?|procura na internet|busca na internet|investiga|faz uma pesquisa)(?:\s+(?:sobre|por|na internet))?\s+.+$/i.test(value);
  const isAndroidAppOpen = (value: string) =>
    /^(?:abre|abrir|inicia|iniciar)\s+(?:whatsapp|facebook|instagram|tiktok|gmail|google drive|drive|google calendar|calendar|calendário|calendario|maps|google maps|google)$/i.test(value);

  // Uma missão pode cruzar pesquisa, organização local e abertura de aplicações.
  // Chamadas, SMS e ações destrutivas externas não entram na execução em cadeia.
  const supported = normalized.every(value =>
    isTask(value) || isMemoryWrite(value) || isMemoryRead(value) ||
    isKnowledgeSearch(value) || isAndroidAppOpen(value)
  );
  if (!supported) return { isCompound: false, steps: [], clarification: null, supported: false };

  const domains = normalized.map(value =>
    isKnowledgeSearch(value) ? "pesquisa" :
    isAndroidAppOpen(value) ? "Android" :
    isTask(value) ? "tarefas" : "memória"
  );
  return {
    isCompound: true,
    steps: normalized,
    clarification: "Preparei uma missão com " + normalized.length + " etapas (" +
      domains.join(" → ") + "): " +
      normalized.map((step, index) => (index + 1) + ") " + step).join("; ") +
      ". Queres que execute todas por esta ordem?",
    supported: true
  };
}
