# WYZEN AI

Assistente pessoal Android com voz e texto, com geração conversacional prioritariamente no próprio dispositivo e um servidor WYZEN de apoio.

## Arquitetura conversacional atual

- **Android (Expo / React Native):** interface, microfone, reconhecimento de voz, leitura de respostas e comandos.
- **Modelo local (llama.rn):** quando instalado, o modelo GGUF Qwen2.5 0.5B Instruct gera as respostas no Android, com histórico curto de conversa e notas de memória locais.
- **Servidor próprio (Python / FastAPI):** alternativa de apoio com regras de diálogo, contexto SQLite e classificador de intenções treinável.
- **Sem APIs de IA externas:** a aplicação não envia conversas para ChatGPT, OpenAI ou outros serviços de inferência. O ficheiro do modelo é descarregado do Hugging Face; os pesos base são de um modelo aberto de terceiros, não foram treinados de raiz pela WYZEN.

**Limite importante:** o modelo local é pequeno e pode falhar em raciocínio complexo, factos recentes ou português menos comum. O classificador do servidor não é um LLM. Esta arquitetura executa inferência local sem depender de APIs externas, mas ainda não representa um modelo fundacional treinado pela WYZEN.

## Pesquisa de conhecimento online

A pesquisa geral está integrada através da API Tavily (pesquisa básica sem chave, sujeita aos limites partilhados do serviço). Para perguntas que exigem pesquisa, a aplicação envia apenas a pergunta, recebe excertos e URLs, e usa esses dados como contexto do modelo local. Se Tavily estiver indisponível ou limitar pedidos, a aplicação recorre à API pública da Wikipédia (MediaWiki), em português e com recurso à versão inglesa quando necessário. As fontes consultadas são apresentadas na resposta.

A pesquisa geral amplia a cobertura, mas os excertos não garantem que uma afirmação esteja correta. A WYZEN deve identificar a origem, verificar a data e distinguir resultados de pesquisa de confirmação independente. A integração de conectores dedicados a fontes oficiais (por exemplo, OMS, ONU e Banco Mundial) continua como etapa seguinte.

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

A geração local requer que o utilizador descarregue o modelo (cerca de 398 MB) e que o dispositivo tenha memória e capacidade de processamento suficientes. A voz requer build nativa Android e permissões. O APK ainda não foi compilado ou testado num dispositivo físico.

## Compilação Android

O ficheiro `eas.json` contém um perfil `preview` para APK e um perfil `production` para AAB. Com uma conta Expo:

```bash
npx eas-cli build --platform android --profile preview
```

## Segurança e próximos passos

Ações externas ou destrutivas exigem confirmação. O executor Android atual só tem suporte inicial para abrir URLs HTTPS; não existe controlo geral do telemóvel.

Próximas etapas: validar a API, adicionar autenticação de utilizadores, melhorar o conjunto de treino em português, criar avaliação de qualidade e evoluir para modelos próprios mais capazes com dados e recursos computacionais adequados.

## Visão de produto aprovada

- Interface minimalista: apenas a letra **W** ao centro; sem grelhas de módulos nem painéis cheios de botões.
- Arranque com animação e estados de processamento; autenticação inicial por nome e identificação vocal, com sessão persistente protegida no dispositivo e recuperação segura.
- Produto de utilizador único, associado ao proprietário do dispositivo.
- Interação principal por voz e linguagem natural; texto disponível como alternativa discreta.
- Objetivo de autonomia: responder com clareza, distinguir factos de incerteza, planear tarefas e executar ações autorizadas.
- Integrações iniciais pretendidas: WhatsApp, Facebook, Instagram, TikTok, Google (Gmail, Drive, Calendar e Pesquisa Google) e Google Maps.
- Arquitetura extensível por conectores para permitir adicionar outras contas e serviços no futuro, sem redesenhar o núcleo.
- As integrações usarão APIs oficiais/OAuth quando disponíveis, permissões mínimas e revogáveis. Capacidades variam por plataforma, tipo de conta e aprovação.
- Ações com impacto externo (enviar, publicar, apagar, alterar definições ou fazer compras) exigem confirmação explícita.

## Centro de Controlo e voz

O Centro de Controlo inicial está disponível por comandos de voz ou texto:
- `centro de controlo`: apresenta os comandos e limites disponíveis.
- `abre WhatsApp/Facebook/Instagram/TikTok/Gmail/Drive/Calendar/Maps/Google`: tenta abrir a aplicação instalada e usa o endereço oficial como alternativa.
- `autoriza microfone/contactos/calendário/notificações`: solicita a permissão correspondente ao Android.
- `abre definições`: abre as definições de permissões da WYZEN.

A abertura de uma aplicação não equivale a acesso à conta nem permite ler ou alterar o seu conteúdo. Para operações dentro de WhatsApp, Meta, TikTok e Google são necessários os respetivos fluxos oficiais de OAuth/API, com permissões e aprovações aplicáveis.

A voz contínua pode ser ativada com `ativa voz contínua` e desligada com `desativa voz contínua`. Nesta fase, a escuta contínua funciona apenas enquanto a WYZEN está aberta e em primeiro plano. Ao passar para segundo plano, a escuta é parada de propósito. Palavra de despertar permanente e operação em segundo plano exigem um serviço nativo Android em primeiro plano, notificação persistente, controlos de privacidade e testes de bateria; ainda não estão implementados. A frase inicial de configuração continua a ser verificação de texto reconhecido, não biometria vocal.

## Limites de integração

A lista de integrações é o objetivo do produto, não uma declaração de que todas as operações já estão disponíveis. WhatsApp, Meta, TikTok e Google têm regras, permissões, revisões e limitações próprias. A implementação deverá apresentar claramente o que cada conta permite fazer. O reconhecimento de voz, isoladamente, não será tratado como autenticação infalível; deverá ser combinado com mecanismos seguros do Android.

## Inventário funcional Android (estado real)

Implementado no código:
- Interface central W, inicialização animada e sessão local persistida com SecureStore.
- Entrada inicial por nome e frase falada (a frase é verificada pelo texto reconhecido; ainda não é biometria de voz).
- Comandos por voz/texto processados pelo modelo local quando instalado; o servidor próprio é usado como alternativa quando o modelo não está disponível.
- Abrir marcador telefónico com número, sempre deixando a confirmação final da chamada ao utilizador.
- Preparar SMS com destinatário e texto na aplicação de mensagens; o utilizador confirma o envio no Android.
- Procurar um contacto pelo nome com permissão do Android.
- Criar lembrete com notificação e, quando existe calendário gravável, evento no calendário.
- Confirmação explícita antes das ações de chamada, SMS e lembrete.

Ainda por implementar e testar em dispositivo:
- Ler SMS recebidos/conteúdo e histórico: requer integração Android nativa, permissões especiais e, em vários cenários, papel de aplicação SMS predefinida; não é fornecido pela atual camada Expo.
- Histórico de chamadas, atender/terminar chamadas e iniciar chamadas automaticamente: requer APIs Android nativas e permissões/limitações específicas.
- Voz contínua em segundo plano/ativação por palavra de despertar: requer serviço Android em primeiro plano, notificação persistente e testes de bateria/privacidade.
- Gestão completa de tarefas com lista, estados, recorrência e sincronização.
- Contactos completos, chamadas/SMS por nome com resolução robusta e desambiguação.
- Aprendizagem persistente e memória do utilizador com controlos de privacidade.
- Integrações oficiais e autenticação OAuth para WhatsApp, Meta, TikTok, Google e Maps.
- Testes funcionais em aparelho real e geração do APK final.

Não declarar nenhuma destas capacidades pendentes como pronta antes de estar implementada e validada. O APK só deve ser distribuído depois de CI, compilação EAS e testes reais passarem.
