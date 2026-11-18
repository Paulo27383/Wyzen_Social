# WYZEN Native Conversational Engine

Servidor próprio da WYZEN: API Python/FastAPI, regras de conversação e classificador de intenções treinável com exemplos próprios. Não usa OpenAI, ChatGPT nem modelos generativos externos.

## Capacidades atuais

- Classificação nativa de saudações, identidade, planeamento, aprendizagem, pesquisa, tradução, opinião, comparação, resumo, escrita, programação, resolução de problemas e pedidos de esclarecimento.
- Endpoint público de conversa sem estado: processa apenas a mensagem atual.
- Histórico e notas pessoais permanecem no dispositivo e não são enviados ao servidor.
- SQLite é usado apenas para exemplos de treino do classificador.
- Classificador TF-IDF + regressão logística treinável com exemplos aprovados pelo administrador.
- Regras de confiança para evitar que previsões fracas do classificador substituam regras de diálogo explícitas.

**Limite técnico:** este motor é um sistema simbólico e classificatório com respostas estruturadas. Ainda não é um modelo generativo geral nem consegue responder com conhecimento aberto a qualquer pergunta como um LLM. Quando não tem dados suficientes, pede contexto em vez de inventar.

## Executar com Docker

```bash
cp .env.example .env
# Edita .env e define WYZEN_ADMIN_TOKEN
docker build -t wyzen-server .
docker run --env-file .env -p 8000:8000 -v wyzen-data:/app/data wyzen-server
```

## Endpoints

- `GET /health`: estado e capacidades do motor.
- `POST /v1/chat`: recebe apenas `{"message":"..."}`; não autentica utilizadores nem guarda conversas.
- `POST /v1/train`: guarda um exemplo de treino; exige Bearer token de administrador.
- `POST /v1/train/model`: treina o classificador; exige Bearer token e pelo menos 12 exemplos em 2 intenções.

Exemplo de treino:

```bash
curl -X POST http://localhost:8000/v1/train \
  -H "Authorization: Bearer O_TEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Organiza as minhas tarefas de hoje","intent":"planning"}'
```

## Segurança e operação

O chat é deliberadamente stateless até existir autenticação individual real. O endpoint continua público e precisa de rate limiting e monitorização antes de produção. As rotas de treino exigem token Bearer comparado em tempo constante. Bases SQLite antigas podem ainda conter conversas de versões anteriores: esta alteração deixa esses registos intocados para evitar apagar dados silenciosamente; a sua retenção ou eliminação deve ser tratada numa migração operacional controlada. Usa HTTPS e nunca coloques segredos no cliente Android.
