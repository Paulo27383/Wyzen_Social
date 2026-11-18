# WYZEN — arquitetura da palavra de ativação Android

## Estado confirmado antes da implementação

- A aplicação usa Expo SDK 54 e React Native 0.81.5.
- O repositório não contém uma pasta `android/`; o projeto depende de prebuild/EAS.
- A escuta contínua atual usa `expo-speech-recognition` e é interrompida quando a aplicação passa para segundo plano.
- Não existe atualmente um serviço Android em primeiro plano nem um motor local de deteção de palavra de ativação.
- O APK não foi compilado nem testado num dispositivo físico nesta etapa.

## Motor escolhido

Usar **sherpa-onnx**, projeto open-source Apache-2.0, com execução local/offline.

A documentação oficial publica modelos KWS Zipformer pequenos (3.3M parâmetros) para inglês e chinês. O modelo inglês GigaSpeech é o candidato inicial para testar a pronúncia da marca **“WYZEN”**. O sherpa-onnx permite configurar palavras-chave personalizadas sem treinar novamente o modelo, mas isso não garante que a pronúncia “WYZEN” seja detetada corretamente: é obrigatório testar áudio real e ajustar a representação fonética/keywords.

Referências:
- https://k2-fsa.github.io/sherpa/onnx/kws/index.html
- https://k2-fsa.github.io/sherpa/onnx/android/index.html
- https://github.com/k2-fsa/sherpa-onnx

## Arquitetura pretendida

1. O utilizador ativa explicitamente “Escuta em segundo plano” dentro da WYZEN, com a aplicação visível.
2. A camada nativa Android inicia um Foreground Service do tipo `microphone`, com notificação persistente, ação para parar e estado visível na interface.
3. O serviço usa `AudioRecord` e sherpa-onnx KWS para detetar localmente “WYZEN”. O áudio da deteção não é enviado para servidor.
4. Ao detetar a palavra, o serviço interrompe/liberta a captura KWS e encaminha o pedido de reconhecimento do comando em português para uma implementação Android compatível. A captura não deve ser partilhada em simultâneo por dois motores.
5. O resultado do reconhecimento é entregue ao núcleo WYZEN existente. O modelo generativo local só deve ser carregado quando necessário; o motor KWS deve permanecer leve.
6. Ações com efeitos externos continuam sujeitas a confirmação explícita. A interface deve mostrar quando a escuta está ativa e permitir desligá-la imediatamente.

## Requisitos Android

- Declarar `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE` e `RECORD_AUDIO` conforme a versão Android e o tipo de serviço.
- Criar o canal e a notificação persistente com ação de paragem.
- Iniciar o serviço enquanto a Activity está visível e após consentimento/permissão do utilizador. Android restringe o início de serviços de microfone a partir do background.
- Tratar negação/revogação de permissões, interrupções de áudio, reinício do processo, encerramento pelo utilizador e restrições do fabricante.
- Não prometer escuta permanente após force-stop, reinício do dispositivo, revogação de permissões ou encerramento pelo sistema.
- Não guardar nem transmitir áudio contínuo. Só manter buffers temporários em memória e descartá-los após a deteção.

Referências oficiais:
- https://developer.android.com/develop/background-work/services/fgs/service-types
- https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start

## Empacotamento nativo / EAS

O sherpa-onnx Android requer o AAR/API Kotlin e bibliotecas JNI nativas por ABI. A documentação oficial recomenda obter as bibliotecas Android pré-compiladas da página de releases ou compilá-las com NDK. A integração deve fixar uma versão e validar os checksums dos artefactos antes de os incluir no APK.

Não usar uma dependência React Native de terceiros não auditada como substituto do runtime oficial. Não adicionar bibliotecas nativas fictícias nem um serviço que apenas mostre “à escuta” sem detetar a palavra.

A primeira integração deverá suportar pelo menos `arm64-v8a`; adicionar `armeabi-v7a` apenas depois de confirmar a ABI do dispositivo e o impacto no tamanho do APK. O modelo KWS deve ser descarregado sob pedido para armazenamento privado, com progresso, espaço necessário e possibilidade de remoção; não embutir um modelo grande no bundle JavaScript.

## Plano de implementação e validação

- [ ] Confirmar a ABI e a versão Android do dispositivo de teste.
- [x] Fixar a release sherpa-onnx v2.0.1 via JitPack (ainda falta validar a resolução Gradle e as ABIs no build).
- [x] Criar módulo Expo local, config plugin, permissões e serviço Android em primeiro plano.
- [x] Implementar o Foreground Service, notificação persistente e API nativa start/stop.
- [x] Integrar sherpa-onnx KWS, descarregar modelo inglês GigaSpeech int8 sob pedido e configurar keyword “wyzen”.
- [ ] Testar falsos positivos/negativos com pronúncia de Angola, ruído ambiente, ecrã apagado e outras aplicações abertas.
- [x] Ligar a deteção à escuta de comandos pt-PT no JS, libertando primeiro o AudioRecord do KWS.
- [ ] Medir CPU, RAM, bateria e temperatura no dispositivo real.
- [ ] Só depois de testes passar, iniciar build EAS APK e entregar para instalação.

## Estado da implementação (18-11-2026)\n\nA primeira integração de código foi gravada na branch: módulo Expo local `modules/wyzen-wake-word`, serviço Kotlin `WyzenWakeWordService`, plugin `plugins/withWyzenWakeWord.js` e ligação em `App.tsx`. O modelo inglês é usado apenas para a palavra de ativação; após a deteção, o serviço liberta o microfone e o reconhecimento de comandos passa para `pt-PT`. O modelo é descarregado na primeira ativação para armazenamento privado do app.\n\n**Ainda não foi compilado nem executado num dispositivo.** A integração depende de confirmar a resolução JitPack/Expo autolinking, permissões Android, extração do arquivo e qualidade real da deteção. Não considerar a função pronta até esses testes passarem.\n\n## Critério de conclusão

A funcionalidade só pode ser marcada como pronta quando a notificação persistente, deteção real de “WYZEN” em segundo plano e passagem para reconhecimento do comando tiverem sido observadas num dispositivo físico. Uma compilação bem-sucedida, isoladamente, não prova que o microfone ou a deteção funcionem.
