import React, { useEffect, useRef, useState } from "react";
import {
  Alert, Animated, AppState, Easing, Keyboard, StatusBar, StyleSheet, Text,
  TextInput, TouchableWithoutFeedback, Pressable, View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Speech from "expo-speech";
import * as SecureStore from "expo-secure-store";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent
} from "expo-speech-recognition";
import { askWyzen } from "./src/core/wyzenClient";
import { buildDailyPlan, isDailyPlanRequest } from "./src/core/assistantCoordinator";
import { downloadLocalModel, getLocalModelStatus, unloadLocalModel } from "./src/core/localModel";
import { normalizeNaturalCommand, planCompoundCommand } from "./src/core/assistant";
import { rememberWyzen, recallWyzen, forgetWyzen, recordInteraction, dailyInteractions } from "./src/core/memory";
import { addTask, listTasks, completeTask, deleteTask } from "./src/core/tasks";
import { runControlCommand } from "./src/core/controlCenter";
import { parsePhoneCommand, performPhoneAction, confirmPhoneAction, findContact } from "./src/core/phoneActions";

const PROFILE_KEY = "wyzen.owner.profile.v1";
const SESSION_KEY = "wyzen.owner.session.v1";
const WAKE_PHRASE = "A minha voz é a minha chave";
 // A voz pronuncia a marca como uma palavra, sem alterar o texto apresentado.
const speakWyzen = (text: string, options: Speech.SpeechOptions = {}) => {
  const spokenText = text.replace(/\bwyzen\b/gi, "Uáizen");
  Speech.speak(spokenText, options);
};


type Profile = { name: string };

export default function App() {
  const [phase, setPhase] = useState<"boot" | "enroll" | "ready">("boot");
  const [name, setName] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("A iniciar o núcleo WYZEN");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [continuousEnabled, setContinuousEnabled] = useState(false);
  const [enrollingVoice, setEnrollingVoice] = useState(false);
  const [command, setCommand] = useState("");
  const [modelReady, setModelReady] = useState(false);
  const [modelDownloadMB, setModelDownloadMB] = useState(398);
  const [modelBusy, setModelBusy] = useState(false);
  const [modelProgress, setModelProgress] = useState(0);
  const pulse = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.08, duration: 1050, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 1050, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    ]));
    animation.start();
    const boot = async () => {
      try {
        setStatus("A verificar a sessão");
        const savedProfile = await SecureStore.getItemAsync(PROFILE_KEY);
        const savedSession = await SecureStore.getItemAsync(SESSION_KEY);
        const modelStatus = await getLocalModelStatus();
        setModelReady(modelStatus.downloaded);
        setModelDownloadMB(modelStatus.approximateDownloadMB);
        await new Promise(resolve => setTimeout(resolve, 1300));
        if (savedProfile && savedSession === "active") {
          const parsed = JSON.parse(savedProfile) as Profile;
          setProfile(parsed);
          setPhase("ready");
          setStatus("Pronta para te ouvir");
        } else {
          setPhase("enroll");
          setStatus("Configuração inicial");
        }
      } catch {
        setPhase("enroll");
        setStatus("Configuração inicial");
      }
    };
    boot();
    return () => animation.stop();
  }, [pulse]);

  useSpeechRecognitionEvent("result", event => {
    const transcript = event.results?.[0]?.transcript?.trim();
    if (!transcript) return;
    if (enrollingVoice) {
      const normalized = transcript.toLocaleLowerCase("pt-PT").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (!normalized.includes("minha voz") || !normalized.includes("minha chave")) {
        setStatus("Frase não reconhecida. Tenta novamente.");
        setEnrollingVoice(false);
        setListening(false);
        return;
      }
      const owner: Profile = { name: name.trim() };
      SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(owner)).then(() =>
        SecureStore.setItemAsync(SESSION_KEY, "active")
      ).then(() => {
        setProfile(owner);
        setPhase("ready");
        setEnrollingVoice(false);
        setStatus("Sessão iniciada. Olá, " + owner.name);
      }).catch(() => {
        setEnrollingVoice(false);
        setStatus("Não foi possível guardar a sessão");
        Alert.alert("WYZEN", "Não foi possível guardar a sessão neste dispositivo.");
      });
    } else {
      // Em modo contínuo, só aceita comandos depois da palavra-chave Wyzen.
      if (continuousEnabled) {
        const normalized = transcript.toLocaleLowerCase("pt-PT").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const wakeMatch = normalized.match(/\bwyzen\b[,:;.!?\s-]*(.*)$/i);
        if (!wakeMatch) {
          setStatus("À escuta — diz Wyzen para me chamar");
          return;
        }
        const commandAfterWake = wakeMatch[1].trim();
        if (!commandAfterWake) {
          setStatus("Estou aqui. Diz o que precisas.");
          speakWyzen("Estou aqui. Diz o que precisas.", { language: "pt-PT" });
          return;
        }
        setCommand(commandAfterWake);
        setStatus("Palavra-chave reconhecida. A compreender...");
        runCommand(commandAfterWake);
      } else {
        setCommand(transcript);
        setStatus("A compreender o teu pedido");
        runCommand(transcript);
      }
    }
  });
  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    if (enrollingVoice) setStatus("Toca no W e repete a frase de ativação");
    else if (continuousEnabled && phase === "ready" && AppState.currentState === "active") {
      setTimeout(() => {
        try {
          ExpoSpeechRecognitionModule.start({ lang: "pt-PT", interimResults: false, continuous: true });
          setListening(true);
        } catch { setListening(false); }
      }, 500);
    }
  });
  useSpeechRecognitionEvent("error", event => {
    setListening(false);
    setEnrollingVoice(false);
    setStatus("Voz indisponível");
    Alert.alert("WYZEN AI", event.message || "Não foi possível reconhecer a voz.");
  });

  const runCommand = async (rawValue: string, skipCompound = false) => {
    if (!rawValue.trim() || (busy && !skipCompound)) return;
    if (!skipCompound) {
      const compoundPlan = planCompoundCommand(rawValue);
      if (compoundPlan.isCompound && compoundPlan.supported) {
        const message = compoundPlan.clarification || "Plano preparado. Confirma para continuar.";
        setAnswer(message);
        setStatus("Plano preparado — aguarda confirmação");
        speakWyzen(message, { language: "pt-PT" });
        Alert.alert("Confirmar plano WYZEN", message, [
          { text: "Cancelar", style: "cancel", onPress: () => setStatus("Plano cancelado — nenhuma etapa executada") },
          { text: "Executar", onPress: async () => {
            setBusy(true);
            setStatus("A executar o plano");
            const results: string[] = [];
            try {
              for (let index = 0; index < compoundPlan.steps.length; index += 1) {
                setStatus("A executar etapa " + (index + 1) + " de " + compoundPlan.steps.length);
                await runCommand(compoundPlan.steps[index], true);
                results.push("Etapa " + (index + 1) + " processada: " + compoundPlan.steps[index]);
              }
              const summary = "Plano concluído. " + results.join(" • ");
              setAnswer(summary);
              setStatus("Plano concluído");
              speakWyzen("Plano concluído.", { language: "pt-PT" });
            } catch (error) {
              const reason = error instanceof Error ? error.message : "Erro desconhecido";
              setAnswer("O plano foi interrompido na etapa " + (results.length + 1) + ". " + reason);
              setStatus("Plano interrompido");
            } finally {
              setBusy(false);
            }
          }}
        ]);
        return;
      }
    }
    const value = normalizeNaturalCommand(rawValue);
    const normalized = value.trim().toLocaleLowerCase("pt-PT");
    if (isDailyPlanRequest(value)) {
      setBusy(true);
      setAnswer("");
      setStatus("A organizar o teu dia com dados locais");
      try {
        const result = await buildDailyPlan();
        setAnswer(result);
        setStatus("Plano diário preparado — dados mantidos no dispositivo");
        await recordInteraction(value, result, "summary");
        speakWyzen(result, { language: "pt-PT", rate: 0.95 });
      } catch (error) {
        setAnswer(error instanceof Error ? error.message : "Não consegui preparar o plano diário.");
        setStatus("Não foi possível organizar o dia");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (/^(ativa|ativar|liga) (?:a )?(?:voz contínua|palavra-chave|palavra chave|ativação por palavra-chave)$/.test(normalized)) {
      setContinuousEnabled(true);
      setStatus("Voz contínua ativa enquanto a WYZEN estiver aberta");
      try { ExpoSpeechRecognitionModule.start({ lang: "pt-PT", interimResults: false, continuous: true }); setListening(true); }
      catch { setStatus("Não foi possível iniciar a voz contínua"); }
      setAnswer("Modo de palavra-chave ativo. Diz “Wyzen” e depois o teu comando. A escuta funciona enquanto a aplicação estiver aberta e em primeiro plano; em segundo plano ainda é necessário integrar um serviço Android nativo.");
      return;
    }
    if (/^(desativa|desativar|desliga) voz contínua$/.test(normalized)) {
      setContinuousEnabled(false);
      try { ExpoSpeechRecognitionModule.stop(); } catch { /* já parada */ }
      setListening(false);
      setStatus("Voz contínua desativada");
      setAnswer("A escuta contínua foi desligada.");
      return;
    }
    const addTaskMatch = value.trim().match(/^(?:cria|adiciona|regista) tarefa\s+(.+)$/i);
    if (addTaskMatch) {
      try {
        const task = await addTask(addTaskMatch[1]);
        const result = "Tarefa guardada: " + task.title;
        setAnswer(result); setStatus("Tarefa criada"); speakWyzen(result, { language: "pt-PT" });
      } catch (e) { setAnswer(e instanceof Error ? e.message : "Não consegui criar a tarefa."); setStatus("Erro"); }
      return;
    }
    if (/^(?:lista|mostra|consulta) tarefas$/i.test(value.trim())) {
      const tasks = await listTasks();
      const result = tasks.length ? tasks.map((task, i) => (i + 1) + ". " + (task.completed ? "✓ " : "○ ") + task.title).join("\n") : "Ainda não tens tarefas guardadas.";
      setAnswer(result); setStatus("Tarefas"); speakWyzen(result, { language: "pt-PT" });
      return;
    }
    const completeMatch = value.trim().match(/^(?:conclui|termina|marca como feita) tarefa\s+(.+)$/i);
    if (completeMatch) {
      const task = await completeTask(completeMatch[1]);
      const result = task ? "Tarefa concluída: " + task.title : "Não encontrei essa tarefa.";
      setAnswer(result); setStatus("Tarefas"); speakWyzen(result, { language: "pt-PT" });
      return;
    }
    const deleteTaskMatch = value.trim().match(/^(?:apaga|elimina|remove) tarefa\s+(.+)$/i);
    if (deleteTaskMatch) {
      const removed = await deleteTask(deleteTaskMatch[1]);
      const result = removed ? "Tarefa removida." : "Não encontrei essa tarefa.";
      setAnswer(result); setStatus("Tarefas"); speakWyzen(result, { language: "pt-PT" });
      return;
    }
    const rememberMatch = value.trim().match(/^(?:lembra-te que|lembra que|guarda na memória|memoriza)\s+(.+)$/i);
    if (rememberMatch) {
      try {
        await rememberWyzen(rememberMatch[1]);
        const result = "Guardei isso na minha memória deste telemóvel.";
        setAnswer(result); setStatus("Memória atualizada"); speakWyzen(result, { language: "pt-PT" });
      } catch (e) {
        setAnswer(e instanceof Error ? e.message : "Não consegui guardar essa informação.");
        setStatus("Erro na memória");
      }
      return;
    }
    if (/^(resumo de hoje|resume o meu dia|o que fizemos hoje)$/i.test(value.trim())) {
      const history = await dailyInteractions();
      const result = history.length ? "Resumo do dia: " + history.length + " interações guardadas.\\n" + history.slice(0, 10).map((item, index) => (index + 1) + ". " + item.userText + " — " + item.assistantText.slice(0, 180)).join("\\n") : "Ainda não há interações guardadas hoje.";
      setAnswer(result); setStatus("Resumo diário"); speakWyzen(result, { language: "pt-PT" });
      return;
    }
    const memoryQuestion = value.trim().match(/^(?:o que sabes sobre|o que te lembras sobre|procura na memória|consulta a memória sobre)\s+(.+)$/i);
    if (memoryQuestion) {
      const items = await recallWyzen(memoryQuestion[1]);
      const result = items.length ? "Na minha memória encontrei:\n" + items.map((item, index) => (index + 1) + ". " + item.text).join("\n") : "Não encontrei essa informação na minha memória.";
      setAnswer(result); setStatus("Memória consultada"); speakWyzen(result, { language: "pt-PT" });
      return;
    }
    if (/^(o que te pedi para lembrar|o que tens na memória|consulta a memória|mostra a memória)$/i.test(value.trim())) {
      const items = await recallWyzen();
      const result = items.length ? "Lembro-me de:\n" + items.map((item, index) => (index + 1) + ". " + item.text).join("\n") : "Ainda não guardaste informações na minha memória.";
      setAnswer(result); setStatus("Memória consultada"); speakWyzen(result, { language: "pt-PT" });
      return;
    }
    const forgetMatch = value.trim().match(/^(?:esquece|apaga da memória)\s+(.+)$/i);
    if (forgetMatch) {
      const count = await forgetWyzen(forgetMatch[1]);
      const result = count ? "Apaguei " + count + " informação(ões) da memória local." : "Não encontrei essa informação na memória.";
      setAnswer(result); setStatus("Memória atualizada"); speakWyzen(result, { language: "pt-PT" });
      return;
    }
    if (/^(apaga toda a memória|esquece tudo)$/i.test(value.trim())) {
      Alert.alert("Apagar memória", "Queres apagar todas as informações guardadas neste telemóvel?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Apagar", style: "destructive", onPress: async () => {
          const count = await forgetWyzen("");
          const result = "Apaguei toda a memória local (" + count + " registos).";
          setAnswer(result); setStatus("Memória apagada"); speakWyzen(result, { language: "pt-PT" });
        }}
      ]);
      return;
    }
    setBusy(true);
    setAnswer("");
    setStatus("A pensar");
    try {
      const control = await runControlCommand(value.trim());
      if (control.handled) {
        setAnswer(control.message || "Comando do Centro de Controlo concluído.");
        setStatus("Centro de Controlo");
        speakWyzen(control.message || "Concluído", { language: "pt-PT" });
        return;
      }
      const localAction = parsePhoneCommand(value.trim());
      if (localAction) {
        setBusy(false);
        confirmPhoneAction(localAction, async () => {
          setBusy(true);
          setStatus("A executar ação no Android");
          try {
            const result = await performPhoneAction(localAction);
            setAnswer(result);
            setStatus("Concluído");
            speakWyzen(result, { language: "pt-PT" });
          } catch (e) {
            const message = e instanceof Error ? e.message : "Não foi possível executar a ação.";
            setAnswer(message);
            setStatus("Ação não concluída");
          } finally { setBusy(false); }
        });
        return;
      }
      const namedCall = value.trim().match(/^(?:liga|telefonar|chama)\s+para\s+([\p{L}][\p{L} .'-]{1,60})$/iu);
      const namedSms = value.trim().match(/^(?:sms|mensagem)\s+para\s+([\p{L}][\p{L} .'-]{1,60})\s*[:;,]\s*(.+)$/iu);
      if (namedCall || namedSms) {
        const phone = await findContact((namedCall || namedSms)![1].trim());
        const action = namedCall
          ? { type: "call" as const, phone }
          : { type: "sms" as const, phone, message: namedSms![2].trim() };
        setBusy(false);
        confirmPhoneAction(action, async () => {
          setBusy(true);
          setStatus("A preparar ação para o contacto");
          try {
            const result = await performPhoneAction(action);
            setAnswer(result);
            setStatus("Concluído");
            speakWyzen(result, { language: "pt-PT" });
          } catch (e) {
            const message = e instanceof Error ? e.message : "Não foi possível executar a ação.";
            setAnswer(message);
            setStatus("Ação não concluída");
          } finally { setBusy(false); }
        });
        return;
      }
      const contactMatch = value.trim().match(/^(?:procura|encontra|pesquisa) contacto (.+)$/i);
      if (contactMatch) {
        const phone = await findContact(contactMatch[1]);
        const result = "Encontrei o número: " + phone;
        setAnswer(result);
        setStatus("Concluído");
        speakWyzen(result, { language: "pt-PT" });
        return;
      }
      const reply = await askWyzen(value.trim());
      setAnswer(reply.answer);
      const kind = /conselho|aconselha|o que devo fazer|que sugeres/i.test(value) ? "advice" : /resume|resumo|sintetiza/i.test(value) ? "summary" : "conversation";
      await recordInteraction(value, reply.answer, kind);
      setStatus("Concluído — interação guardada");
      if (reply.answer) speakWyzen(reply.answer, { language: "pt-PT", rate: 0.95 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro no motor WYZEN.";
      setAnswer(message);
      setStatus("Não foi possível concluir");
    } finally {
      setBusy(false);
    }
  };

  const startVoice = async () => {
    if (busy || listening) return;
    if (phase === "enroll" && !name.trim()) {
      setStatus("Escreve primeiro o teu nome");
      return;
    }
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permissão necessária", "Autoriza o microfone para configurar e utilizar a WYZEN.");
        return;
      }
      setEnrollingVoice(phase === "enroll");
      setListening(true);
      setStatus(phase === "enroll" ? "A registar a tua frase de ativação" : "A ouvir");
      ExpoSpeechRecognitionModule.start({ lang: "pt-PT", interimResults: false, continuous: phase === "ready" && continuousEnabled });
    } catch {
      setListening(false);
      setEnrollingVoice(false);
      setStatus("Voz indisponível nesta compilação");
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => {
      if (state !== "active") {
        if (continuousEnabled) {
          try { ExpoSpeechRecognitionModule.stop(); } catch { /* ignore */ }
          setListening(false);
          setStatus("Voz pausada pelo Android em segundo plano");
        }
        // Release native model memory when the app is backgrounded.
        // If a reply is being generated, localModel defers release until it finishes.
        void unloadLocalModel().catch(() => {
          // The next request can retry loading the model if release fails.
        });
      }
    });
    return () => subscription.remove();
  }, [continuousEnabled]);

  const installLocalModel = () => {
    if (modelReady || modelBusy) return;
    Alert.alert(
      "Instalar cérebro local",
      `A WYZEN vai descarregar cerca de ${modelDownloadMB} MB uma única vez. Recomenda-se Wi-Fi e espaço livre no telemóvel. Queres continuar?`,
      [
        { text: "Agora não", style: "cancel" },
        { text: "Descarregar", onPress: async () => {
          setModelBusy(true);
          setModelProgress(0);
          setStatus("A descarregar o modelo local");
          try {
            await downloadLocalModel(progress => setModelProgress(progress));
            setModelReady(true);
            setStatus("Cérebro local instalado");
            setAnswer("O modelo local foi descarregado. A partir de agora, as respostas generativas são processadas neste telemóvel.");
          } catch (error) {
            const reason = error instanceof Error ? error.message : "Falha no download";
            setStatus("Não foi possível instalar o modelo");
            setAnswer(reason);
          } finally {
            setModelBusy(false);
          }
        }}
      ]
    );
  };

  const sendTypedCommand = () => {
    const value = command.trim();
    if (!value) return;
    Keyboard.dismiss();
    runCommand(value);
    setCommand("");
  };

  const runQuickAction = (value: string) => {
    if (busy) return;
    runCommand(value);
  };

  const openSystems = () => {
    if (busy) return;
    Alert.alert("SISTEMAS WYZEN", "Escolhe uma ferramenta do núcleo:", [
      { text: "Tarefas", onPress: () => runQuickAction("mostra tarefas") },
      { text: "Memória", onPress: () => runQuickAction("consulta a memória") },
      { text: "Resumo do dia", onPress: () => runQuickAction("resumo de hoje") },
      { text: continuousEnabled ? "Desativar voz contínua" : "Ativar voz contínua", onPress: () => runQuickAction(continuousEnabled ? "desativa voz contínua" : "ativa voz contínua") },
      { text: modelReady ? "Cérebro local instalado" : `Instalar cérebro local · ${modelDownloadMB} MB`, onPress: () => { if (!modelReady) installLocalModel(); } },
      { text: "Fechar", style: "cancel" }
    ]);
  };

  const executeCommand = () => {
    const value = command.trim();
    if (!value) {
      Alert.alert("EXECUTAR", "Escreve ou dita primeiro o que queres que a Wyzen faça.");
      return;
    }
    Keyboard.dismiss();
    runCommand(value);
    setCommand("");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#050306" />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.screen}>
          <View style={styles.top}><Text style={styles.wordmark}>WYZEN</Text><Text style={styles.topline}>PERSONAL INTELLIGENCE</Text></View>
          <View style={styles.center}><View pointerEvents="none" style={styles.waveHalo}><View style={styles.waveRed} /><View style={styles.waveBlue} /></View>
            <Animated.View style={{ transform: [{ scale: pulse }] }}>
              <View style={styles.emblem}>
                <Text onPress={startVoice} style={styles.w}>W</Text>
              </View>
            </Animated.View>
            <Text style={styles.creator}>WYZEN AI</Text><Text style={styles.brandline}>YOUR PERSONAL CONTROL CENTER</Text>
            <Text style={styles.status}>{status}</Text>
            {phase === "enroll" && (
              <View style={styles.enroll}>
                <Text style={styles.title}>A tua identidade</Text>
                <Text style={styles.hint}>Indica o teu nome. Depois toca no W e fala para iniciar a tua sessão.</Text>
                <TextInput value={name} onChangeText={setName} placeholder="O teu nome"
                  placeholderTextColor="#68718A" autoCapitalize="words" style={styles.nameInput} />
                <Text style={styles.phrase}>Frase de ativação: “{WAKE_PHRASE}”</Text>
              </View>
            )}
            {phase === "ready" && !!answer && (
              <Text selectable style={styles.answer}>{answer}</Text>
            )}
          </View>
          {phase === "ready" && (
            <View>
              <View style={styles.composer}>
                <TextInput value={command} onChangeText={setCommand}
                  onSubmitEditing={sendTypedCommand} returnKeyType="send"
                  placeholder="Escreve ou dita à Wyzen..." placeholderTextColor="#68718A"
                  style={styles.commandInput} multiline />
              </View>
              <View style={styles.primaryActions}>
              <Pressable onPress={sendTypedCommand} disabled={busy || !command.trim()} accessibilityRole="button" accessibilityLabel="Enviar mensagem" style={({ pressed }) => [styles.primaryButton, styles.sendButton, pressed && styles.quickPressed]}>
                <Text style={styles.send}>ENVIAR</Text>
              </Pressable>
              <Pressable onPress={executeCommand} disabled={busy} accessibilityRole="button" accessibilityLabel="Executar pedido" style={({ pressed }) => [styles.primaryButton, styles.executeButton, pressed && styles.quickPressed]}>
                <Text style={styles.executeText}>✦  EXECUTAR</Text>
              </Pressable>
              <Pressable onPress={openSystems} disabled={busy} accessibilityRole="button" accessibilityLabel="Abrir sistemas" style={({ pressed }) => [styles.primaryButton, styles.systemsButton, pressed && styles.quickPressed]}>
                <Text style={styles.systemsText}>⌘  SISTEMAS</Text>
              </Pressable>
              </View>
            </View>
          )}
          <Text style={styles.footer}>ASSISTENTE PESSOAL • SESSÃO PRIVADA</Text>
        </View>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#050306" },
  screen: { flex: 1, backgroundColor: "#050306", paddingHorizontal: 25, justifyContent: "space-between", overflow: "hidden" },
  top: { alignItems: "center", paddingTop: 18 },
  wordmark: { color: "#F5F8FF", fontSize: 18, fontWeight: "900", letterSpacing: 9, textShadowColor: "#00CFFF", textShadowRadius: 16 },
  topline: { color: "#9AA9C2", fontSize: 8, fontWeight: "700", letterSpacing: 3.2, marginTop: 7 },
  center: { alignItems: "center", justifyContent: "center", flex: 1, width: "100%" },
  waveHalo: { position: "absolute", width: 300, height: 300, alignItems: "center", justifyContent: "center" },
  waveRed: { position: "absolute", width: 286, height: 112, borderWidth: 2, borderColor: "rgba(255,45,75,0.72)", borderRadius: 100, transform: [{ rotate: "-28deg" }], shadowColor: "#FF234D", shadowRadius: 22, shadowOpacity: 0.9 },
  waveBlue: { position: "absolute", width: 286, height: 112, borderWidth: 2, borderColor: "rgba(0,205,255,0.8)", borderRadius: 100, transform: [{ rotate: "28deg" }], shadowColor: "#00CFFF", shadowRadius: 22, shadowOpacity: 0.9 },
  emblem: { alignItems: "center", justifyContent: "center", minWidth: 230, minHeight: 220 },
  crown: { color: "#EAF6FF", fontSize: 62, lineHeight: 72, fontWeight: "900", textShadowColor: "#00CFFF", textShadowRadius: 18, marginBottom: -18, zIndex: 2 },
  w: { color: "#F1F5FA", fontSize: 150, fontWeight: "900", fontStyle: "italic", letterSpacing: -18, textShadowColor: "#00BFFF", textShadowRadius: 24, textShadowOffset: { width: 3, height: 0 } },
  creator: { color: "#F5F8FF", fontSize: 15, fontWeight: "900", letterSpacing: 6, marginTop: -5, textShadowColor: "#FF294F", textShadowRadius: 14 },
  brandline: { color: "#8794A8", fontSize: 8, fontWeight: "700", letterSpacing: 2, marginTop: 12 },
  status: { color: "#A6B2C5", fontSize: 12, letterSpacing: 1, marginTop: 12, textAlign: "center" },
  enroll: { width: "100%", marginTop: 38, alignItems: "center" },
  title: { color: "#F4F6FF", fontSize: 19, fontWeight: "600" },
  hint: { color: "#A6B2C5", fontSize: 12, lineHeight: 19, textAlign: "center", marginTop: 9, maxWidth: 290 },
  nameInput: { width: "82%", color: "white", borderBottomWidth: 1, borderBottomColor: "#00BFEF", paddingVertical: 12, textAlign: "center", fontSize: 16, marginTop: 17 },
  phrase: { color: "#748096", fontSize: 10, marginTop: 13, textAlign: "center" },
  answer: { color: "#E0E8F5", fontSize: 14, lineHeight: 22, textAlign: "center", marginTop: 28, maxWidth: 330 },
  composer: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: "#26313D", paddingTop: 10, paddingBottom: 6, gap: 12 },
  primaryActions: { flexDirection: "row", gap: 8, paddingBottom: 10 },
  primaryButton: { flex: 1, minWidth: 0, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  executeButton: { borderWidth: 1, borderColor: "rgba(255,45,90,0.65)", backgroundColor: "rgba(255,45,90,0.10)" },
  executeText: { color: "#FF6685", fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  systemsButton: { borderWidth: 1, borderColor: "rgba(160,130,255,0.65)", backgroundColor: "rgba(125,90,220,0.12)" },
  systemsText: { color: "#C1A9FF", fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  commandInput: { flex: 1, color: "white", fontSize: 13, maxHeight: 90, paddingVertical: 8 },
  sendButton: { borderWidth: 1, borderColor: "rgba(0,213,255,0.65)", backgroundColor: "rgba(0,213,255,0.10)" },
  sendPressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  send: { color: "#00D5FF", fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  quickPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  footer: { color: "#687487", fontSize: 8, letterSpacing: 2, textAlign: "center", paddingVertical: 16 }
});
