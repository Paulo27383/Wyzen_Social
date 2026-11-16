export type CommandResult = {
  title: string;
  steps: string[];
  requiresConfirmation: boolean;
  status: "planned" | "needs_setup";
};

const sensitiveTerms = [
  "enviar", "apagar", "eliminar", "comprar", "pagar",
  "publicar", "partilhar", "instalar", "desinstalar"
];

export function planCommand(raw: string): CommandResult {
  const command = raw.trim();
  const normalized = command.toLocaleLowerCase("pt");
  const sensitive = sensitiveTerms.some(term => normalized.includes(term));

  if (!command) {
    return {
      title: "Escreve ou dita uma ordem",
      steps: ["Aguardando o teu comando."],
      requiresConfirmation: false,
      status: "planned"
    };
  }

  return {
    title: "Plano preparado",
    steps: [
      `Comando recebido: “${command}”`,
      "Interpretar o objetivo e dividir em etapas.",
      "Verificar ferramentas e permissões disponíveis.",
      sensitive
        ? "Solicitar confirmação explícita antes de qualquer ação sensível."
        : "Executar apenas ações locais e autorizadas quando o motor estiver ligado.",
      "Apresentar o resultado e registar a atividade."
    ],
    requiresConfirmation: sensitive,
    status: "needs_setup"
  };
}
