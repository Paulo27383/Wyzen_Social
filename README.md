# WYZEN AI

Assistente pessoal Android com autonomia avançada, comunicação por texto e voz e execução sujeita a permissões.

## Arquitetura inicial

- **Aplicação Android:** React Native + Expo, interface em português.
- **Interface de comandos:** entrada por texto, saída de voz e reconhecimento de fala (dependente de build nativa e permissões).
- **Núcleo de orquestração:** interpreta comandos, cria planos e encaminha tarefas para ferramentas.
- **Camada de ferramentas:** adaptadores isolados para ficheiros, calendário, pesquisa, GitHub e automações.
- **Memória:** preferências e contexto com controlos de consulta e eliminação.
- **Segurança:** permissões mínimas, registo de atividade, confirmação para ações sensíveis e lista de ferramentas autorizadas.
- **Backend futuro:** API autenticada para modelo de IA, armazenamento e execução de tarefas. Segredos ficam no servidor, nunca na aplicação Android.

## Estado da versão 0.1.0

A primeira entrega inclui a estrutura Expo, ecrã inicial, entrada de texto, preparação local de planos e leitura dos planos em voz alta. Ainda não existe ligação a um modelo de IA nem execução remota ou controlo geral do Android.

## Executar localmente

```bash
npm install
npx expo run:android
```

O reconhecimento de voz requer build nativa e autorização de microfone. Expo Go pode não incluir o módulo nativo.

## Próximas etapas

1. Implementar reconhecimento de voz no dispositivo.
2. Criar backend seguro e ligar um modelo de IA.
3. Adicionar ferramentas com permissões granulares.
4. Implementar memória e histórico.
5. Testar em Android físico e preparar APK/AAB.

## Segurança

A WYZEN AI deve executar apenas ações autorizadas. Pagamentos, envio de mensagens, publicação, eliminação de dados e outras ações sensíveis exigem confirmação explícita.
