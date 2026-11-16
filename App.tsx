import React, { useState } from "react";
import {
  Alert, ScrollView, StatusBar, StyleSheet, Text, TextInput,
  TouchableOpacity, View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Speech from "expo-speech";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent
} from "expo-speech-recognition";
import { askWyzen } from "./src/core/wyzenClient";

export default function App() {
  const [command, setCommand] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);

  useSpeechRecognitionEvent("result", event => {
    const transcript = event.results?.[0]?.transcript;
    if (transcript) setCommand(transcript);
  });
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("error", event => {
    setListening(false);
    Alert.alert("Reconhecimento de voz", event.message || "Não foi possível reconhecer a voz.");
  });

  const startVoice = async () => {
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permissão necessária", "Autoriza o acesso ao microfone para ditar comandos.");
        return;
      }
      setListening(true);
      ExpoSpeechRecognitionModule.start({
        lang: "pt-PT",
        interimResults: true,
        continuous: false
      });
    } catch {
      setListening(false);
      Alert.alert("Voz indisponível", "A voz requer uma compilação Android nativa com o módulo instalado.");
    }
  };

  const run = async () => {
    if (!command.trim() || busy) return;
    setBusy(true);
    setAnswer("");
    try {
      const reply = await askWyzen(command.trim());
      setAnswer(reply.answer);
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : "Erro ao contactar o motor WYZEN.");
    } finally {
      setBusy(false);
    }
  };

  const speak = () => {
    if (answer) Speech.speak(answer, { language: "pt-PT", rate: 0.95 });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.logo}><Text style={styles.logoText}>W</Text></View>
          <View>
            <Text style={styles.brand}>WYZEN AI</Text>
            <Text style={styles.subtitle}>ASSISTENTE PESSOAL INTELIGENTE</Text>
          </View>
          <View style={styles.status}><View style={styles.dot}/><Text style={styles.statusText}>ONLINE LOCAL</Text></View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>O TEU MOTOR DE EXECUÇÃO</Text>
          <Text style={styles.heading}>Dá uma ordem.\nA WYZEN planeia.</Text>
          <Text style={styles.description}>Um assistente Android para voz, texto, inteligência e ferramentas autorizadas.</Text>
          <View style={styles.orb}><Text style={styles.orbText}>✦</Text></View>
        </View>

        <Text style={styles.section}>COMANDO</Text>
        <View style={styles.composer}>
          <TextInput value={command} onChangeText={setCommand}
            placeholder="Ex.: ajuda-me a organizar o meu dia..."
            placeholderTextColor="#77819A" multiline style={styles.input}/>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.voiceButton} onPress={startVoice}>
              <Text style={styles.voiceText}>{listening ? "A ouvir..." : "🎙  DITAR"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.runButton} onPress={run} disabled={busy}>
              <Text style={styles.runText}>{busy ? "A pensar..." : "Executar ordem  →"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {!!answer && <View style={styles.result}>
          <Text style={styles.resultTitle}>Resposta WYZEN</Text>
          <Text style={styles.answer}>{answer}</Text>
          <TouchableOpacity onPress={speak} style={styles.speakButton}>
            <Text style={styles.speakText}>🔊 Ouvir resposta</Text>
          </TouchableOpacity>
        </View>}

        <Text style={styles.section}>MÓDULOS DO ASSISTENTE</Text>
        <View style={styles.grid}>
          {[
            ["✦", "Inteligência", "Modelo IA no backend"],
            ["⌘", "Automação", "Motor de tarefas"],
            ["◉", "Voz", "Ditado e leitura"],
            ["▤", "Ficheiros", "Integração em preparação"],
            ["◎", "Pesquisa", "Ferramentas em preparação"],
            ["⬡", "Segurança", "Permissões e histórico"]
          ].map(([icon, title, detail]) => (
            <View key={title} style={styles.module}>
              <Text style={styles.moduleIcon}>{icon}</Text>
              <Text style={styles.moduleTitle}>{title}</Text>
              <Text style={styles.moduleDetail}>{detail}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.footer}>WYZEN AI • ANDROID • AUTONOMIA AVANÇADA COM CONTROLO</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#080D19" },
  container: { padding: 20, paddingBottom: 42 },
  header: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 30 },
  logo: { width: 43, height: 43, borderRadius: 14, backgroundColor: "#5267F5", alignItems: "center", justifyContent: "center" },
  logoText: { color: "white", fontSize: 25, fontWeight: "900" },
  brand: { color: "white", fontSize: 17, fontWeight: "900", letterSpacing: 2 },
  subtitle: { color: "#8490AA", fontSize: 8, letterSpacing: 1.2, marginTop: 3 },
  status: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 5, backgroundColor: "#39D6A0" },
  statusText: { color: "#39D6A0", fontSize: 9, fontWeight: "800" },
  hero: { backgroundColor: "#111B34", borderRadius: 25, padding: 22, marginBottom: 27, overflow: "hidden" },
  eyebrow: { color: "#8EA0FF", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  heading: { color: "white", fontSize: 31, lineHeight: 37, fontWeight: "900", marginTop: 13 },
  description: { color: "#AAB5CE", fontSize: 13, lineHeight: 20, marginTop: 10, maxWidth: 260 },
  orb: { position: "absolute", right: 18, bottom: 20, width: 76, height: 76, borderRadius: 40, borderWidth: 1, borderColor: "#667BFF", alignItems: "center", justifyContent: "center", backgroundColor: "#263A76" },
  orbText: { color: "#C6CEFF", fontSize: 39 },
  section: { color: "#8996B3", fontSize: 10, fontWeight: "900", letterSpacing: 1.8, marginBottom: 12 },
  composer: { backgroundColor: "#11192B", borderColor: "#26334D", borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 24 },
  input: { minHeight: 76, color: "white", fontSize: 14, textAlignVertical: "top" },
  actions: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 10 },
  voiceButton: { borderRadius: 12, borderWidth: 1, borderColor: "#3B4967", paddingHorizontal: 14, paddingVertical: 12 },
  voiceText: { color: "#D7DDF0", fontSize: 11, fontWeight: "800" },
  runButton: { backgroundColor: "#596CF6", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, flex: 1, alignItems: "center" },
  runText: { color: "white", fontWeight: "800", fontSize: 12 },
  result: { backgroundColor: "#101A2D", borderRadius: 17, padding: 16, marginBottom: 25, borderWidth: 1, borderColor: "#33446A" },
  resultTitle: { color: "white", fontSize: 17, fontWeight: "800", marginBottom: 13 },
  answer: { color: "#C5CEE1", fontSize: 13, lineHeight: 20 },
  speakButton: { backgroundColor: "#202F55", padding: 12, borderRadius: 10, alignItems: "center", marginTop: 14 },
  speakText: { color: "white", fontWeight: "700", fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  module: { width: "48%", minHeight: 105, backgroundColor: "#11192B", borderRadius: 15, padding: 14, borderWidth: 1, borderColor: "#202C43" },
  moduleIcon: { color: "#93A0FF", fontSize: 20, marginBottom: 8 },
  moduleTitle: { color: "white", fontWeight: "800", fontSize: 13 },
  moduleDetail: { color: "#8793AC", fontSize: 10, marginTop: 4 },
  footer: { color: "#5E6A82", fontSize: 8, textAlign: "center", marginTop: 28, letterSpacing: 1 }
});
