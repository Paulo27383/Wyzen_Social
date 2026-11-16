# WYZEN AI

Assistente pessoal Android com voz e texto, ligado a um servidor próprio e a um núcleo de inteligência treinável sem modelos pré-treinados.

## Arquitetura híbrida atual

- **Android (Expo / React Native):** interface, microfone, reconhecimento de voz, leitura de respostas e comandos.
- **Servidor próprio (Python / FastAPI):** API de conversa, memória SQLite e classificador de intenções.
- **Aprendizagem própria inicial:** exemplos fornecidos por nós são guardados e usados para treinar um classificador TF-IDF + regressão logística a partir do zero.
- **Sem modelos externos:** o servidor não chama OpenAI, ChatGPT ou APIs de modelos de terceiros.

**Limite importante:** esta primeira inteligência é um classificador de intenções com respostas estruturadas, não é ainda uma IA generativa nem raciocina como um LLM. O treino melhora o reconhecimento de intenções com exemplos próprios; não cria capacidades gerais de linguagem automaticamente.

## Servidor

Ver `server/README.md` para execução Docker, treino e endpoints.

Para executar o servidor em desenvolvimento:

```bash
cd server
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Antes de expor na Internet, configura HTTPS, autenticação por utilizador, limites de pedidos, backups e monitorização. Define `WYZEN_ADMIN_TOKEN` para proteger os endpoints de treino.

## Aplicação Android

Cria um ficheiro `.env` na raiz:

```env
EXPO_PUBLIC_WYZEN_SERVER_URL=https://TEU-SERVIDOR
```

Depois:

```bash
npm install
npm run typecheck
npx expo start
```

A voz requer build nativa Android e permissões. O APK ainda não foi compilado ou testado num dispositivo físico.

## Compilação Android

O ficheiro `eas.json` contém um perfil `preview` para APK e um perfil `production` para AAB. Com uma conta Expo:

```bash
npx eas-cli build --platform android --profile preview
```

## Segurança e próximos passos

Ações externas ou destrutivas exigem confirmação. O executor Android atual só tem suporte inicial para abrir URLs HTTPS; não existe controlo geral do telemóvel.

Próximas etapas: validar a API, adicionar autenticação de utilizadores, melhorar o conjunto de treino em português, criar avaliação de qualidade e evoluir para modelos próprios mais capazes com dados e recursos computacionais adequados.
