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
import { buildDailyPlan, isDailyPlanRequest, resolveContextualFollowUp } from "./src/core/assistantCoordinator";
import { downloadLocalModel, getLocalModelStatus, unloadLocalModel } from "./src/core/localModel";
import { normalizeNaturalCommand, planCompoundCommand } from "./src/core/assistant";
import { rememberWyzen, recallWyzen, forgetWyzen, recordInteraction, dailyInteractions } from "./src/core/memory";
import { addTask, listTasks, completeTask, deleteTask } from "./src/core/tasks";
import { runControlCommand } from "./src/core/controlCenter";
import { parsePhoneCommand, performPhoneAction, confirmPhoneAction, findContact } from "./src/core/phoneActions";
import { getOwnerProfile, updateOwnerProfile } from "./src/core/ownerProfile";
import { getActiveMission, startMission, updateMissionStep, finishMission } from "./src/core/missionControl";
import { learnFromCorrection, getExplicitLearning, forgetExplicitLearning, recordCoreOutcome, assessCore, prepareInitiative, reviewExecutionPlan } from "./src/core/cognitiveCore";

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
      ).then(async () => {
        await updateOwnerProfile({
          displayName: owner.name,
          preferredAddress: owner.name.split(/\s+/)[0] || owner.name
        });
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

  const runCommandInternal = async (rawValue: string, skipCompound = false): Promise<{ status: "completed" | "failed"; error?: string }> => {
    if (!rawValue.trim()) return { status: "completed" };
    if (busy && !skipCompound) return { status: "failed", error: "A WYZEN já está a executar outro pedido." };
    const missionCommand = rawValue.trim().toLocaleLowerCase("pt-PT");
    if (!skipCompound && /^(?:estado|progresso) (?:da )?miss[aã]o$/.test(missionCommand)) {
      const mission = await getActiveMission();
      if (!mission) {
        const message = "Ainda não existe uma missão guardada. Diz-me o teu objetivo e vou dividi-lo em etapas.";
        setAnswer(message); setStatus("Sem missão guardada"); speakWyzen(message, { language: "pt-PT" });
        return { status: "completed" };
      }
      const labels = { pending: "por iniciar", running: "em curso — confirma se foi concluída", completed: "concluída", failed: "interrompida" };
      const lines = mission.steps.map((step, index) => (index + 1) + ". " + labels[step.status] + " — " + step.command);
      const message = "PROGRESSO DA MISSÃO · " + mission.status.toLocaleUpperCase("pt-PT") + "\n" + lines.join("\n") +
        (mission.status === "completed" ? "\nMissão terminada." : "\nPróximo passo: diz “retoma missão” quando quiseres continuar.");
      setAnswer(message); setStatus("Estado da missão"); speakWyzen("Aqui está o progresso da missão.", { language: "pt-PT" });
      return { status: "completed" };
    }
    if (!skipCompound && /^(?:retoma|continua|prossegue) (?:a )?miss[aã]o$/.test(missionCommand)) {
      const mission = await getActiveMission();
      if (!mission || mission.status === "completed") {
        const message = "Não encontrei uma missão pendente. Diz-me o objetivo e preparo uma nova missão.";
        setAnswer(message); setStatus("Sem missão pendente"); speakWyzen(message, { language: "pt-PT" });
        return { status: "completed" };
      }
      const message = "Encontrei uma missão com " + mission.steps.length + " etapas. A próxima é " +
        (mission.nextStep + 1) + ": " + (mission.steps[mission.nextStep]?.command || "rever o resultado") +
        ". Se a aplicação foi fechada durante uma etapa, confirma o estado dessa etapa antes de continuar. Queres retomar?";
      Alert.alert("Retomar missão WYZEN", message, [
        { text: "Agora não", style: "cancel" },
        { text: "Retomar", onPress: async () => {
          setBusy(true);
          let activeStep = mission.nextStep;
          try {
            for (let index = mission.nextStep; index < mission.steps.length; index += 1) {
              activeStep = index;
              setStatus("Missão retomada · etapa " + (index + 1) + " de " + mission.steps.length);
              await updateMissionStep(mission.id, index, "running");
              const execution = await runCommand(mission.steps[index].command, true);
              if (execution.status !== "completed") throw new Error(execution.error || "A etapa não foi confirmada.");
              await updateMissionStep(mission.id, index, "completed");
            }
            await finishMission(mission.id);
            await recordCoreOutcome("retoma de missão", "success", mission.steps.length + " etapas concluídas e registadas.");
            const result = "Missão concluída. Todas as " + mission.steps.length + " etapas foram processadas.";
            setAnswer(result); setStatus("Missão concluída"); speakWyzen(result, { language: "pt-PT" });
          } catch (error) {
            const reason = error instanceof Error ? error.message : "Falha inesperada";
            await updateMissionStep(mission.id, activeStep, "failed", reason);
            await recordCoreOutcome("retoma de missão", "failure", reason);
            setAnswer("A missão ficou interrompida. " + reason + " Podes verificar a etapa e pedir para retomar.");
            setStatus("Missão interrompida");
          } finally { setBusy(false); }
        }}
      ]);
      return { status: "completed" };
    }
    if (!skipCompound) {
      const compoundPlan = planCompoundCommand(rawValue);
      if (compoundPlan.isCompound && compoundPlan.supported) {
        const review = reviewExecutionPlan(compoundPlan.steps);
        if (!review.approved) {
          const message = "Não vou executar este plano sem revisão: " + review.warnings.join(" ");
          setAnswer(message); setStatus("Plano bloqueado na verificação de segurança");
          await recordCoreOutcome("raciocínio e segurança", "failure", message);
          return { status: "failed", error: message };
        }
        const message = (compoundPlan.clarification || "Plano preparado. Confirma para continuar.") +
          "\nVerificação do núcleo: confiança " + review.confidence +
          (review.warnings.length ? "\nAtenção: " + review.warnings.join(" ") : " · sem riscos detetados nesta verificação.");
        setAnswer(message);
        setStatus("Plano preparado — aguarda confirmação");
        speakWyzen(message, { language: "pt-PT" });
        Alert.alert("Confirmar plano WYZEN", message, [
          { text: "Cancelar", style: "cancel", onPress: () => setStatus("Plano cancelado — nenhuma etapa executada") },
          { text: "Executar", onPress: async () => {
            setBusy(true);
            setStatus("A preparar a missão");
            let mission: Awaited<ReturnType<typeof startMission>> | null = null;
            let activeStep = 0;
            try {
              mission = await startMission(compoundPlan.steps);
              for (let index = 0; index < mission.steps.length; index += 1) {
                activeStep = index;
                setStatus("Missão em curso · etapa " + (index + 1) + " de " + mission.steps.length);
                await updateMissionStep(mission.id, index, "running");
                const execution = await runCommand(mission.steps[index].command, true);
                if (execution.status !== "completed") throw new Error(execution.error || "A etapa não foi confirmada.");
              await updateMissionStep(mission.id, index, "completed");
              }
              await finishMission(mission.id);
              await recordCoreOutcome("execução de missão", "success", mission.steps.length + " etapas concluídas e registadas.");
              const summary = "Missão concluída. " + mission.steps.length + " etapas processadas e registadas. Podes pedir “retoma missão” para continuar trabalhos interrompidos.";
              setAnswer(summary);
              setStatus("Missão concluída");
              await recordInteraction(rawValue, summary, "summary");
              speakWyzen("Missão concluída.", { language: "pt-PT" });
            } catch (error) {
              const reason = error instanceof Error ? error.message : "Erro desconhecido";
              if (mission) await updateMissionStep(mission.id, activeStep, "failed", reason);
              await recordCoreOutcome("execução de missão", "failure", reason);
              setAnswer("A missão foi interrompida. " + reason + " O progresso ficou guardado; podes pedir “retoma missão” depois de verificar a última etapa.");
              setStatus("Missão interrompida");
            } finally {
              setBusy(false);
            }
          }}
        ]);
        return { status: "completed" };
      }
    }
    const value = normalizeNaturalCommand(rawValue);
    const normalized = value.trim().toLocaleLowerCase("pt-PT");
    const correctionMatch = value.trim().match(/^(?:corrige(?: a wyzen)?|aprende com esta corre[cç][aã]o)\\s*[:,-]?\\s*(.+)$/i);
    if (correctionMatch) {
      try {
        const learned = await learnFromCorrection(correctionMatch[1]);
        const result = "Correção guardada na aprendizagem explícita: " + learned.correction + ". Vou tratá-la como orientação confirmada nas próximas interações compatíveis. Não alterei o modelo nem as regras de segurança.";
        setAnswer(result); setStatus("Aprendizagem atualizada"); speakWyzen("Correção guardada.", { language: "pt-PT" });
        await recordCoreOutcome("aprendizagem", "success", "Correção explícita guardada.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não consegui guardar a correção.";
        setAnswer(message); setStatus("Aprendizagem não atualizada");
        await recordCoreOutcome("aprendizagem", "failure", message);
      }
      return { status: "completed" };
    }
    if (/^(?:o que aprendeste comigo|mostra as corre[cç][oõ]es|consulta aprendizagem)$/i.test(value.trim())) {
      const items = await getExplicitLearning();
      const result = items.length
        ? "Aprendizagem confirmada por ti:\\n" + items.map((item, index) => (index + 1) + ". " + item.correction).join("\\n")
        : "Ainda não guardaste correções explícitas. Podes dizer: “Corrige a WYZEN: ...”.";
      setAnswer(result); setStatus("Aprendizagem consultada"); speakWyzen(result, { language: "pt-PT" });
      return { status: "completed" };
    }
    const forgetLearningMatch = value.trim().match(/^(?:esquece|apaga) (?:a )?corre[cç][aã]o (.+)$/i);
    if (forgetLearningMatch || /^(?:esquece toda a aprendizagem|apaga todas as corre[cç][oõ]es)$/i.test(value.trim())) {
      const count = await forgetExplicitLearning(forgetLearningMatch?.[1] || "");
      const result = count
        ? "Removi " + count + " correção(ões) da aprendizagem explícita."
        : "Não encontrei correções correspondentes.";
      setAnswer(result); setStatus("Aprendizagem atualizada"); speakWyzen(result, { language: "pt-PT" });
      return { status: "completed" };
    }
    if (/^(?:avalia o teu desempenho|diagn[oó]stico do n[uú]cleo|estado interno da wyzen)$/i.test(value.trim())) {
      const report = await assessCore();
      const rate = report.successRate === null ? "ainda sem amostra suficiente" : report.successRate + "% de registos bem-sucedidos";
      const result = "AUTOAVALIAÇÃO WYZEN\\nExecuções registadas: " + report.total +
        "\\nSucessos: " + report.successful + " · Falhas: " + report.failed + " · Incertos: " + report.uncertain +
        "\\nTaxa observada: " + rate + "\\nCorreções explícitas aprendidas: " + report.learningCount +
        "\\nTarefas pendentes: " + report.pendingTasks +
        (report.recent.length ? "\\nÚltimos registos:\\n" + report.recent.map(item => "• " + item.capability + " — " + item.result + ": " + item.detail).join("\\n") : "");
      setAnswer(result); setStatus("Autoavaliação concluída"); speakWyzen("Autoavaliação concluída.", { language: "pt-PT" });
      return { status: "completed" };
    }
    if (/^(?:analisa|rev[eê]) (?:as )?(?:minhas )?tarefas pendentes|o que devo priorizar$/i.test(value.trim())) {
      const result = await prepareInitiative();
      setAnswer(result); setStatus("Iniciativa preparada"); speakWyzen(result, { language: "pt-PT" });
      await recordCoreOutcome("iniciativa", "success", "Análise de tarefas pendentes preparada.");
      return { status: "completed" };
    }
    const contextualFollowUp = await resolveContextualFollowUp(value);
    if (contextualFollowUp) {
      setAnswer(contextualFollowUp);
      setStatus("Contexto recuperado localmente");
      await recordInteraction(value, contextualFollowUp, "summary");
      speakWyzen(contextualFollowUp, { language: "pt-PT", rate: 0.95 });
      return { status: "completed" };
    }
    if (isDailyPlanRequest(value)) {
      setBusy(true);
      setAnswer("");
      setStatus("A organizar o teu dia com dados locais");
      try {
        const plan = await buildDailyPlan();
        const owner = await getOwnerProfile();
        const result = plan.toLocaleLowerCase("pt-PT").includes((owner.preferredAddress || owner.displayName).toLocaleLowerCase("pt-PT"))
          ? plan
          : (owner.preferredAddress || owner.displayName) + ", " + plan;
        setAnswer(result);
        setStatus("Plano diário preparado — dados mantidos no dispositivo");
        await recordInteraction(value, result, "summary");
        speakWyzen(result, { language: "pt-PT", rate: 0.95 });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não consegui preparar o plano diário.";
        setAnswer(message);
        setStatus("Não foi possível organizar o dia");
        return { status: "failed", error: message };
      } finally {
        setBusy(false);
      }
      return { status: "completed" };
    }
    if (/^(ativa|ativar|liga) (?:a )?(?:voz contínua|palavra-chave|palavra chave|ativação por palavra-chave)$/.test(normalized)) {
      setContinuousEnabled(true);
      setStatus("Voz contínua ativa enquanto a WYZEN estiver aberta");
      try { ExpoSpeechRecognitionModule.start({ lang: "pt-PT", interimResults: false, continuous: true }); setListening(true); }
      catch { setStatus("Não foi possível iniciar a voz contínua"); }
      setAnswer("Modo de palavra-chave ativo. Diz “Wyzen” e depois o teu comando. A escuta funciona enquanto a aplicação estiver aberta e em primeiro plano; em segundo plano ainda é necessário integrar um serviço Android nativo.");
      return { status: "completed" };
    }
    if (/^(desativa|desativar|desliga) voz contínua$/.test(normalized)) {
      setContinuousEnabled(false);
      try { ExpoSpeechRecognitionModule.stop(); } catch { /* já parada */ }
      setListening(false);
      setStatus("Voz contínua desativada");
      setAnswer("A escuta contínua foi desligada.");
      return { status: "completed" };
    }
    const addTaskMatch = value.trim().match(/^(?:cria|adiciona|regista) tarefa\s+(.+)$/i);
    if (addTaskMatch) {
      try {
        const task = await addTask(addTaskMatch[1]);
        const result = "Tarefa guardada: " + task.title;
        setAnswer(result); setStatus("Tarefa criada"); speakWyzen(result, { language: "pt-PT" });
      } catch (e) { const message = e instanceof Error ? e.message : "Não consegui criar a tarefa."; setAnswer(message); setStatus("Erro"); return { status: "failed", error: message }; }
      return { status: "completed" };
    }
    if (/^(?:lista|mostra|consulta) tarefas$/i.test(value.trim())) {
      const tasks = await listTasks();
      const result = tasks.length ? tasks.map((task, i) => (i + 1) + ". " + (task.completed ? "✓ " : "○ ") + task.title).join("\n") : "Ainda não tens tarefas guardadas.";
      setAnswer(result); setStatus("Tarefas"); speakWyzen(result, { language: "pt-PT" });
      return { status: "completed" };
    }
    const completeMatch = value.trim().match(/^(?:conclui|termina|marca como feita) tarefa\s+(.+)$/i);
    if (completeMatch) {
      const task = await completeTask(completeMatch[1]);
      if (!task && skipCompound) return { status: "failed", error: "Não encontrei a tarefa: " + completeMatch[1] };
      const result = task ? "Tarefa concluída: " + task.title : "Não encontrei essa tarefa.";
      setAnswer(result); setStatus("Tarefas"); speakWyzen(result, { language: "pt-PT" });
      return { status: "completed" };
    }
    const deleteTaskMatch = value.trim().match(/^(?:apaga|elimina|remove) tarefa\s+(.+)$/i);
    if (deleteTaskMatch) {
      const removed = await deleteTask(deleteTaskMatch[1]);
      if (!removed && skipCompound) return { status: "failed", error: "Não encontrei a tarefa para remover: " + deleteTaskMatch[1] };
      const result = removed ? "Tarefa removida." : "Não encontrei essa tarefa.";
      setAnswer(result); setStatus("Tarefas"); speakWyzen(result, { language: "pt-PT" });
      return { status: "completed" };
    }
    const rememberMatch = value.trim().match(/^(?:lembra-te que|lembra que|guarda na memória|memoriza)\s+(.+)$/i);
    if (rememberMatch) {
      try {
        await rememberWyzen(rememberMatch[1]);
        const result = "Guardei isso na minha memória deste telemóvel.";
        setAnswer(result); setStatus("Memória atualizada"); speakWyzen(result, { language: "pt-PT" });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Não consegui guardar essa informação.";
        setAnswer(message);
        setStatus("Erro na memória");
        return { status: "failed", error: message };
      }
      return { status: "completed" };
    }
    if (/^(resumo de hoje|resume o meu dia|o que fizemos hoje)$/i.test(value.trim())) {
      const history = await dailyInteractions();
      const result = history.length ? "Resumo do dia: " + history.length + " interações guardadas.\\n" + history.slice(0, 10).map((item, index) => (index + 1) + ". " + item.userText + " — " + item.assistantText.slice(0, 180)).join("\\n") : "Ainda não há interações guardadas hoje.";
      setAnswer(result); setStatus("Resumo diário"); speakWyzen(result, { language: "pt-PT" });
      return { status: "completed" };
    }
    const memoryQuestion = value.trim().match(/^(?:o que sabes sobre|o que te lembras sobre|procura na memória|consulta a memória sobre)\s+(.+)$/i);
    if (memoryQuestion) {
      const items = await recallWyzen(memoryQuestion[1]);
      const result = items.length ? "Na minha memória encontrei:\n" + items.map((item, index) => (index + 1) + ". " + item.text).join("\n") : "Não encontrei essa informação na minha memória.";
      setAnswer(result); setStatus("Memória consultada"); speakWyzen(result, { language: "pt-PT" });
      return { status: "completed" };
    }
    if (/^(o que te pedi para lembrar|o que tens na memória|consulta a memória|mostra a memória)$/i.test(value.trim())) {
      const items = await recallWyzen();
      const result = items.length ? "Lembro-me de:\n" + items.map((item, index) => (index + 1) + ". " + item.text).join("\n") : "Ainda não guardaste informações na minha memória.";
      setAnswer(result); setStatus("Memória consultada"); speakWyzen(result, { language: "pt-PT" });
      return { status: "completed" };
    }
    const forgetMatch = value.trim().match(/^(?:esquece|apaga da memória)\s+(.+)$/i);
    if (forgetMatch) {
      const count = await forgetWyzen(forgetMatch[1]);
      const result = count ? "Apaguei " + count + " informação(ões) da memória local." : "Não encontrei essa informação na memória.";
      setAnswer(result); setStatus("Memória atualizada"); speakWyzen(result, { language: "pt-PT" });
      return { status: "completed" };
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
      return { status: "completed" };
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
        return { status: "completed" };
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
        return { status: "completed" };
      }
      const namedCall = value.trim().match(/^(?:liga|telefonar|chama)\s+para\s+([\p{L}][\p{L} .'-]{1,60})$/iu);
      const namedSms = value.trim().match(/^(?:sms|mensagem)\s+para\s+([\p{L}][\p{L} .'-]{1,60})\s*[:;,]\s*(.+)$/iu);
      if (namedCall || namedSms) {
        let contactName = (namedCall || namedSms)![1].trim();
        const owner = await getOwnerProfile();
        if (/^(?:a\s+)?minha\s+mãe$/iu.test(contactName)) {
          if (!owner.motherName) {
            const prompt = (owner.preferredAddress || "Podolsky") + ", ainda não sei o nome da tua mãe. Diz-me como ela está guardada nos teus contactos para eu a encontrar.";
            setAnswer(prompt);
            setStatus("Preciso de identificar o contacto");
            speakWyzen(prompt, { language: "pt-PT" });
            return { status: "completed" };
          }
          contactName = owner.motherName;
        }
        const phone = await findContact(contactName);
        const action = namedCall
          ? { type: "call" as const, phone }
          : { type: "sms" as const, phone, message: namedSms![2].trim() };
        const announcement = namedCall
          ? (owner.preferredAddress || "Podolsky") + ", está bem. Vou preparar a chamada para " + contactName + ". Confirma para continuar."
          : (owner.preferredAddress || "Podolsky") + ", preparei a mensagem para " + contactName + ". Confirma para continuar.";
        setAnswer(announcement);
        setStatus("A aguardar confirmação do contacto");
        speakWyzen(announcement, { language: "pt-PT" });
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
        return { status: "completed" };
      }
      const contactMatch = value.trim().match(/^(?:procura|encontra|pesquisa) contacto (.+)$/i);
      if (contactMatch) {
        const phone = await findContact(contactMatch[1]);
        const result = "Encontrei o número: " + phone;
        setAnswer(result);
        setStatus("Concluído");
        speakWyzen(result, { language: "pt-PT" });
        return { status: "completed" };
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
      return { status: "failed", error: message };
    } finally {
      setBusy(false);
    }
    return { status: "completed" };
  };

  // Registo único de resultados: o mesmo núcleo acompanha comandos simples e etapas de missão.
  const runCommand = async (rawValue: string, skipCompound = false): Promise<{ status: "completed" | "failed"; error?: string }> => {
    const result = await runCommandInternal(rawValue, skipCompound);
    const normalized = rawValue.trim().toLocaleLowerCase("pt-PT");
    const isMissionPlanner = !skipCompound && planCompoundCommand(rawValue).isCompound;
    if (rawValue.trim() && !isMissionPlanner) {
      try {
        await recordCoreOutcome(
          skipCompound ? "etapa de missão" : "execução de comando",
          result.status === "completed" ? "success" : "failure",
          result.status === "completed" ? normalized.slice(0, 180) : (result.error || "Comando não concluído").slice(0, 180)
        );
      } catch {
        // A falha do registo não altera o resultado real do comando.
      }
    }
    return result;
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

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#050306" />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.screen}>
          <View style={styles.center}>
            <View pointerEvents="none" style={styles.waveHalo}>
              <View style={styles.waveRed} />
              <View style={styles.waveBlue} />
            </View>
            <Animated.View style={{ transform: [{ scale: pulse }] }}>
              <View style={styles.emblem}>
                <Text onPress={startVoice} accessibilityRole="button" style={styles.w}>W</Text>
              </View>
            </Animated.View>
            <Text style={styles.wordmark}>WYZEN</Text>
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
                placeholder="Fala comigo..." placeholderTextColor="#778395"
                style={styles.commandInput} multiline />
              <Pressable onPress={sendTypedCommand} disabled={busy || !command.trim()}
                accessibilityRole="button" accessibilityLabel="Enviar comando"
                style={({ pressed }) => [styles.sendControl, pressed && styles.quickPressed]}>
                <Text style={styles.sendIcon}>↑</Text>
              </Pressable>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#030507" },
  screen: { flex: 1, backgroundColor: "#030507", paddingHorizontal: 22, justifyContent: "space-between", overflow: "hidden" },
  top: { alignItems: "center", paddingTop: 18 },
  wordmark: { color: "#EAF6FF", fontSize: 16, fontWeight: "900", letterSpacing: 7, marginTop: 4, textShadowColor: "#00CFFF", textShadowRadius: 14 },
  topline: { color: "#9AA9C2", fontSize: 8, fontWeight: "700", letterSpacing: 3.2, marginTop: 7 },
  center: { alignItems: "center", justifyContent: "center", flex: 1, width: "100%", paddingVertical: 18 },
  waveHalo: { position: "absolute", width: 300, height: 300, alignItems: "center", justifyContent: "center" },
  waveRed: { position: "absolute", width: 270, height: 106, borderWidth: 1.5, borderColor: "rgba(255,45,75,0.48)", borderRadius: 100, transform: [{ rotate: "-28deg" }], shadowColor: "#FF234D", shadowRadius: 18, shadowOpacity: 0.65 },
  waveBlue: { position: "absolute", width: 270, height: 106, borderWidth: 1.5, borderColor: "rgba(0,205,255,0.62)", borderRadius: 100, transform: [{ rotate: "28deg" }], shadowColor: "#00CFFF", shadowRadius: 18, shadowOpacity: 0.7 },
  emblem: { alignItems: "center", justifyContent: "center", minWidth: 230, minHeight: 220 },
  crown: { color: "#EAF6FF", fontSize: 62, lineHeight: 72, fontWeight: "900", textShadowColor: "#00CFFF", textShadowRadius: 18, marginBottom: -18, zIndex: 2 },
  w: { color: "#F1F5FA", fontSize: 150, fontWeight: "900", fontStyle: "italic", letterSpacing: -18, textShadowColor: "#00BFFF", textShadowRadius: 24, textShadowOffset: { width: 3, height: 0 } },


  status: { color: "#AAB7C8", fontSize: 13, letterSpacing: 0.4, marginTop: 14, textAlign: "center" },
  enroll: { width: "100%", marginTop: 38, alignItems: "center" },
  title: { color: "#F4F6FF", fontSize: 19, fontWeight: "600" },
  hint: { color: "#A6B2C5", fontSize: 12, lineHeight: 19, textAlign: "center", marginTop: 9, maxWidth: 290 },
  nameInput: { width: "82%", color: "white", borderBottomWidth: 1, borderBottomColor: "#00BFEF", paddingVertical: 12, textAlign: "center", fontSize: 16, marginTop: 17 },
  phrase: { color: "#748096", fontSize: 10, marginTop: 13, textAlign: "center" },
  answer: { color: "#E6EDF5", fontSize: 18, lineHeight: 29, textAlign: "left", marginTop: 28, width: "100%", maxWidth: 380, paddingHorizontal: 5, flexShrink: 1 },
  composer: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#202A36", backgroundColor: "#0B1017", borderRadius: 22, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 12, minHeight: 62, gap: 12 },
  primaryActions: { flexDirection: "row", gap: 8, paddingBottom: 10 },
  primaryButton: { flex: 1, minWidth: 0, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  executeButton: { borderWidth: 1, borderColor: "rgba(255,45,90,0.65)", backgroundColor: "rgba(255,45,90,0.10)" },
  executeText: { color: "#FF6685", fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  systemsButton: { borderWidth: 1, borderColor: "rgba(160,130,255,0.65)", backgroundColor: "rgba(125,90,220,0.12)" },
  systemsText: { color: "#C1A9FF", fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  commandInput: { flex: 1, color: "#F4F7FB", fontSize: 17, lineHeight: 24, maxHeight: 110, paddingVertical: 8 },
  sendButton: { borderWidth: 1, borderColor: "rgba(0,213,255,0.65)", backgroundColor: "rgba(0,213,255,0.10)" },
  sendPressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  sendControl: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#102633", borderWidth: 1, borderColor: "#14516A" },
  sendIcon: { color: "#55DFFF", fontSize: 27, fontWeight: "600", lineHeight: 30 },
  quickPressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  footer: { color: "#687487", fontSize: 8, letterSpacing: 2, textAlign: "center", paddingVertical: 16 }
});
