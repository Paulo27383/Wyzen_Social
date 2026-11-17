import React, { useEffect, useRef, useState } from "react";
import {
  Alert, Animated, Easing, Keyboard, StatusBar, StyleSheet, Text,
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
      const normalized = transcript.toLocaleLowerCase("pt-PT").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
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
      setCommand(transcript);
      setStatus("A compreender o teu pedido");
      runCommand(transcript);
    }
  });
  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    if (enrollingVoice) setStatus("Toca no W e repete a frase de ativação");
  });
  useSpeechRecognitionEvent("error", event => {
    setListening(false);
    setEnrollingVoice(false);
    setStatus("Voz indisponível");
    Alert.alert("WYZEN AI", event.message || "Não foi possível reconhecer a voz.");
  });

  const runCommand = async (value: string) => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setAnswer("");
    setStatus("A pensar");
    try {
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
      setStatus("Concluído");
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
      ExpoSpeechRecognitionModule.start({ lang: "pt-PT", interimResults: false, continuous: false });
    } catch {
      setListening(false);
      setEnrollingVoice(false);
      setStatus("Voz indisponível nesta compilação");
    }
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
      <StatusBar barStyle="light-content" backgroundColor="#050711" />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.screen}>
          <View style={styles.top}><Text style={styles.wordmark}>WYZEN</Text></View>
          <View style={styles.center}>
            <Animated.View style={{ transform: [{ scale: pulse }] }}>
              <Text onPress={startVoice} style={styles.w}>W</Text>
            </Animated.View>
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
