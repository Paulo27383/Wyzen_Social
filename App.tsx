import React, { useEffect, useRef, useState } from "react";
import {
  Alert, Animated, AppState, Easing, Keyboard, StatusBar, StyleSheet, Text,
  TextInput, TouchableWithoutFeedback, View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Speech from "expo-speech";
import * as SecureStore from "expo-secure-store";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent
} from "expo-speech-recognition";
import { askWyzen } from "./src/core/wyzenClient";
import { rememberWyzen, recallWyzen, forgetWyzen, recordInteraction, dailyInteractions } from "./src/core/memory";
import { addTask, listTasks, completeTask, deleteTask } from "./src/core/tasks";
import { runControlCommand } from "./src/core/controlCenter";
import { parsePhoneCommand, performPhoneAction, confirmPhoneAction, findContact } from "./src/core/phoneActions";

const PROFILE_KEY = "wyzen.owner.profile.v1";
const SESSION_KEY = "wyzen.owner.session.v1";
const WAKE_PHRASE = "A minha voz é a minha chave";

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
          Speech.speak("Estou aqui. Diz o que precisas.", { language: "pt-PT" });
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

  const runCommand = async (value: string) => {
    if (!value.trim() || busy) return;
    const normalized = value.trim().toLocaleLowerCase("pt-PT");
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
        setAnswer(result); setStatus("Tarefa criada"); Speech.speak(result, { language: "pt-PT" });
      } catch (e) { setAnswer(e instanceof Error ? e.message : "Não consegui criar a tarefa."); setStatus("Erro"); }
      return;
    }
    if (/^(?:lista|mostra|consulta) tarefas$/i.test(value.trim())) {
      const tasks = await listTasks();
      const result = tasks.length ? tasks.map((task, i) => (i + 1) + ". " + (task.completed ? "✓ " : "○ ") + task.title).join("\n") : "Ainda não tens tarefas guardadas.";
      setAnswer(result); setStatus("Tarefas"); Speech.speak(result, { language: "pt-PT" });
      return;
    }
    const completeMatch = value.trim().match(/^(?:conclui|termina|marca como feita) tarefa\s+(.+)$/i);
    if (completeMatch) {
      const task = await completeTask(completeMatch[1]);
      const result = task ? "Tarefa concluída: " + task.title : "Não encontrei essa tarefa.";
      setAnswer(result); setStatus("Tarefas"); Speech.speak(result, { language: "pt-PT" });
      return;
    }
    const deleteTaskMatch = value.trim().match(/^(?:apaga|elimina|remove) tarefa\s+(.+)$/i);
    if (deleteTaskMatch) {
      const removed = await deleteTask(deleteTaskMatch[1]);
      const result = removed ? "Tarefa removida." : "Não encontrei essa tarefa.";
      setAnswer(result); setStatus("Tarefas"); Speech.speak(result, { language: "pt-PT" });
      return;
    }
    const rememberMatch = value.trim().match(/^(?:lembra-te que|lembra que|guarda na memória|memoriza)\s+(.+)$/i);
    if (rememberMatch) {
      try {
        await rememberWyzen(rememberMatch[1]);
        const result = "Guardei isso na minha memória deste telemóvel.";
        setAnswer(result); setStatus("Memória atualizada"); Speech.speak(result, { language: "pt-PT" });
      } catch (e) {
        setAnswer(e instanceof Error ? e.message : "Não consegui guardar essa informação.");
        setStatus("Erro na memória");
      }
      return;
    }
    if (/^(resumo de hoje|resume o meu dia|o que fizemos hoje)$/i.test(value.trim())) {
      const history = await dailyInteractions();
      const result = history.length ? "Resumo do dia: " + history.length + " interações guardadas.\\n" + history.slice(0, 10).map((item, index) => (index + 1) + ". " + item.userText + " — " + item.assistantText.slice(0, 180)).join("\\n") : "Ainda não há interações guardadas hoje.";
      setAnswer(result); setStatus("Resumo diário"); Speech.speak(result, { language: "pt-PT" });
      return;
    }
    const memoryQuestion = value.trim().match(/^(?:o que sabes sobre|o que te lembras sobre|procura na memória|consulta a memória sobre)\s+(.+)$/i);
    if (memoryQuestion) {
      const items = await recallWyzen(memoryQuestion[1]);
      const result = items.length ? "Na minha memória encontrei:\n" + items.map((item, index) => (index + 1) + ". " + item.text).join("\n") : "Não encontrei essa informação na minha memória.";
      setAnswer(result); setStatus("Memória consultada"); Speech.speak(result, { language: "pt-PT" });
      return;
    }
    if (/^(o que te pedi para lembrar|o que tens na memória|consulta a memória|mostra a memória)$/i.test(value.trim())) {
      const items = await recallWyzen();
      const result = items.length ? "Lembro-me de:\n" + items.map((item, index) => (index + 1) + ". " + item.text).join("\n") : "Ainda não guardaste informações na minha memória.";
      setAnswer(result); setStatus("Memória consultada"); Speech.speak(result, { language: "pt-PT" });
      return;
    }
    const forgetMatch = value.trim().match(/^(?:esquece|apaga da memória)\s+(.+)$/i);
    if (forgetMatch) {
      const count = await forgetWyzen(forgetMatch[1]);
      const result = count ? "Apaguei " + count + " informação(ões) da memória local." : "Não encontrei essa informação na memória.";
      setAnswer(result); setStatus("Memória atualizada"); Speech.speak(result, { language: "pt-PT" });
      return;
    }
    if (/^(apaga toda a memória|esquece tudo)$/i.test(value.trim())) {
      Alert.alert("Apagar memória", "Queres apagar todas as informações guardadas neste telemóvel?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Apagar", style: "destructive", onPress: async () => {
          const count = await forgetWyzen("");
          const result = "Apaguei toda a memória local (" + count + " registos).";
          setAnswer(result); setStatus("Memória apagada"); Speech.speak(result, { language: "pt-PT" });
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
        Speech.speak(control.message || "Concluído", { language: "pt-PT" });
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
            Speech.speak(result, { language: "pt-PT" });
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
            Speech.speak(result, { language: "pt-PT" });
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
        Speech.speak(result, { language: "pt-PT" });
        return;
      }
      const reply = await askWyzen(value.trim());
      setAnswer(reply.answer);
      const kind = /conselho|aconselha|o que devo fazer|que sugeres/i.test(value) ? "advice" : /resume|resumo|sintetiza/i.test(value) ? "summary" : "conversation";
      await recordInteraction(value, reply.answer, kind);
      setStatus("Concluído — interação guardada");
      if (reply.answer) Speech.speak(reply.answer, { language: "pt-PT", rate: 0.95 });
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
      if (state !== "active" && continuousEnabled) {
        try { ExpoSpeechRecognitionModule.stop(); } catch { /* ignore */ }
        setListening(false);
        setStatus("Voz pausada pelo Android em segundo plano");
      }
    });
    return () => subscription.remove();
  }, [continuousEnabled]);

  const sendTypedCommand = () => {
    const value = command.trim();
    if (!value) return;
    Keyboard.dismiss();
    runCommand(value);
    setCommand("");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#050711" />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.screen}>
          <View style={styles.top}><Text style={styles.wordmark}>WYZEN</Text></View>
          <View style={styles.center}>
            <Animated.View style={{ transform: [{ scale: pulse }] }}>
              <Text onPress={startVoice} style={styles.w}>W</Text>
            </Animated.View>
            <Text style={styles.creator}>Podolsky</Text>
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
            <View style={styles.composer}>
              <TextInput value={command} onChangeText={setCommand}
                onSubmitEditing={sendTypedCommand} returnKeyType="send"
                placeholder="Ou escreve um comando..." placeholderTextColor="#68718A"
                style={styles.commandInput} multiline />
              <Text onPress={sendTypedCommand} style={styles.send}>ENVIAR</Text>
            </View>
          )}
          <Text style={styles.footer}>ASSISTENTE PESSOAL • SESSÃO PRIVADA</Text>
        </View>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#050711" },
  screen: { flex: 1, backgroundColor: "#050711", paddingHorizontal: 25, justifyContent: "space-between" },
  top: { alignItems: "center", paddingTop: 18 },
  wordmark: { color: "#8C9BFF", fontSize: 11, fontWeight: "800", letterSpacing: 7 },
  center: { alignItems: "center", justifyContent: "center", flex: 1, width: "100%" },
  w: { color: "#F4F6FF", fontSize: 142, fontWeight: "200", letterSpacing: -13, textShadowColor: "#536BFF", textShadowRadius: 34, textShadowOffset: { width: 0, height: 0 } },
  creator: { color: "#8C9BFF", fontSize: 12, fontWeight: "700", letterSpacing: 3, marginTop: -8 },
  status: { color: "#929CB7", fontSize: 12, letterSpacing: 1, marginTop: 12, textAlign: "center" },
  enroll: { width: "100%", marginTop: 38, alignItems: "center" },
  title: { color: "#F4F6FF", fontSize: 19, fontWeight: "600" },
  hint: { color: "#929CB7", fontSize: 12, lineHeight: 19, textAlign: "center", marginTop: 9, maxWidth: 290 },
  nameInput: { width: "82%", color: "white", borderBottomWidth: 1, borderBottomColor: "#46527A", paddingVertical: 12, textAlign: "center", fontSize: 16, marginTop: 17 },
  phrase: { color: "#68718A", fontSize: 10, marginTop: 13, textAlign: "center" },
  answer: { color: "#E0E5F5", fontSize: 14, lineHeight: 22, textAlign: "center", marginTop: 28, maxWidth: 330 },
  composer: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: "#202842", paddingVertical: 12, gap: 12 },
  commandInput: { flex: 1, color: "white", fontSize: 13, maxHeight: 90, paddingVertical: 8 },
  send: { color: "#9AA8FF", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  footer: { color: "#4E5870", fontSize: 8, letterSpacing: 2, textAlign: "center", paddingVertical: 16 }
});
