# WYZEN AI

Assistente pessoal Android com comunicação por texto e voz e execução sujeita a permissões.

## Arquitetura

- **Aplicação Android:** React Native + Expo SDK 54.
- **Voz:** reconhecimento de fala e leitura de respostas (requer compilação nativa e permissões).
- **Motor local:** planeamento básico de comandos.
- **Backend:** Supabase Edge Function preparada para chamar a OpenAI Responses API.
- **Segurança:** a chave da OpenAI deve existir apenas nos secrets do servidor; ações externas e destrutivas exigem confirmação.

## Estado atual

A interface, o ditado, a leitura em voz alta, o planeador local e o esqueleto do backend estão no repositório. A integração remota ainda precisa de autenticação válida e configuração dos secrets. A aplicação ainda não foi compilada nem testada num dispositivo Android. Não existe ainda controlo geral do Android nem execução autónoma de tarefas fora das ações implementadas.

## Configuração local

1. Instala Node.js e dependências:

```bash
npm install
```

2. Cria um ficheiro `.env` com a URL e a chave pública do projeto Supabase:

```env
EXPO_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
```

3. Executa a verificação de tipos e inicia o Expo:

```bash
npm run typecheck
npx expo start
```

O reconhecimento de voz depende de uma build nativa; o Expo Go pode não incluir o módulo.

## Backend Supabase

A função está em `supabase/functions/wyzen-assistant/index.ts`. Configura `OPENAI_API_KEY` como secret da função no Supabase e, opcionalmente, `OPENAI_MODEL`. Nunca coloques a chave da OpenAI no código Android ou no GitHub.

**Importante:** a função está configurada para exigir JWT (`verify_jwt = true`). A aplicação ainda não implementa sessão Supabase de utilizador nem envia um access token JWT válido. Portanto, a chamada remota ainda não está pronta. Não desatives a verificação JWT para contornar este problema; a autenticação deve ser implementada primeiro.

## Compilar Android com EAS

O ficheiro `eas.json` inclui:
- Perfil `preview`: APK para instalação e testes.
- Perfil `production`: Android App Bundle (AAB).

Com uma conta Expo e EAS CLI configurados:

```bash
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview
```

A compilação exige autenticação na Expo e pode solicitar configuração de credenciais Android.

## Segurança

A WYZEN AI deve executar apenas ações autorizadas. Pagamentos, envio de mensagens, publicação, eliminação de dados e outras ações sensíveis exigem confirmação explícita.
