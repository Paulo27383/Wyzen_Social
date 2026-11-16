# WYZEN Own Intelligence Server

Primeiro núcleo próprio da WYZEN: API Python, memória SQLite e classificador de intenções treinável com exemplos próprios. Não usa OpenAI nem qualquer modelo pré-treinado. O classificador inicial só reconhece intenções simples; não é ainda um modelo generativo nem um sistema de raciocínio comparável a um LLM.

## Executar com Docker

```bash
cp .env.example .env
# Edita .env e define WYZEN_ADMIN_TOKEN
docker build -t wyzen-server .
docker run --env-file .env -p 8000:8000 -v wyzen-data:/app/data wyzen-server
```

## Endpoints

- `GET /health`: estado do servidor.
- `POST /v1/chat`: recebe `{"message":"...","user_id":"..."}`.
- `POST /v1/train`: guarda um exemplo de treino; exige Bearer token de administrador.
- `POST /v1/train/model`: treina o classificador local; exige Bearer token e pelo menos 12 exemplos em 2 intenções.

Exemplo de treino:

```bash
curl -X POST http://localhost:8000/v1/train \
  -H "Authorization: Bearer O_TEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Organiza as minhas tarefas de hoje","intent":"planning"}'
```

## Segurança antes de produção

Coloca o servidor atrás de HTTPS, adiciona limites de pedidos, autenticação individual por utilizador, cópias de segurança e monitorização. Não exponhas as rotas de treino sem token. SQLite é adequado apenas para protótipo/baixa carga; migrar para PostgreSQL quando necessário.
