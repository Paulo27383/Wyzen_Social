import React, { useState } from "react";
import {
  ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text,
  TextInput, TouchableOpacity, View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Speech from "expo-speech";
import { planCommand, CommandResult } from "./src/core/assistant";

export default function App() {
  const [command, setCommand] = useState("");
  const [result, setResult] = useState<CommandResult | null>(null);
  const [listening, setListening] = useState(false);

  const run = () => {
    const plan = planCommand(command);
    setResult(plan);
  };

  const speak = () => {
    if (!result) return;
    Speech.speak(
      [result.title, ...result.steps].join(". "),
      { language: "pt-PT", rate: 0.95 }
    );
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
          <View style={styles.status}><View style={styles.dot}/><Text style={styles.statusText}>PRONTA</Text></View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>O TEU MOTOR DE EXECUÇÃO</Text>
          <Text style={styles.heading}>Dá uma ordem.{ "\n" }Vamos tratar do resto.</Text>
          <Text style={styles.description}>Voz, texto e planeamento inteligente num único assistente.</Text>
          <View style={styles.orb}><Text style={styles.orbText}>✦</Text></View>
        </View>

        <Text style={styles.section}>COMANDO</Text>
        <View style={styles.composer}>
          <TextInput
            value={command}
            onChangeText={setCommand}
            placeholder="Ex.: organiza as minhas tarefas de hoje..."
            placeholderTextColor="#77819A"
            multiline
            style={styles.input}
          />
          <View style={styles.actions}>
            <TouchableOpacity style={styles.voiceButton} onPress={() => setListening(!listening)}>
              <Text style={styles.voiceText}>{listening ? "A voz requer configuração" : "🎙  VOZ"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.runButton} onPress={run}>
              <Text style={styles.runText}>Preparar ordem  →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {result && <View style={styles.result}>
          <Text style={styles.resultTitle}>{result.title}</Text>
          {result.steps.map((step, index) => (
            <View key={index} style={styles.step}>
              <Text style={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
          {result.requiresConfirmation && <Text style={styles.warning}>Confirmação necessária para ações sensíveis.</Text>}
          <TouchableOpacity onPress={speak} style={styles.speakButton}><Text style={styles.speakText}>🔊 Ouvir plano</Text></TouchableOpacity>
          <Text style={styles.note}>Motor de IA e execução externa ainda precisam de configuração e ligação a serviços.</Text>
        </View>}

        <Text style={styles.section}>MÓDULOS</Text>
        <View style={styles.grid}>
          {[
            ["✦", "Inteligência", "Planeamento e memória"],
            ["⌘", "Automação", "Fluxos e tarefas"],
            ["◉", "Voz", "Comandos falados"],
            ["▤", "Ficheiros", "Documentos e código"],
            ["◎", "Pesquisa", "Informação online"],
            ["⬡", "Segurança", "Permissões e registos"]
          ].map(([icon, title, detail]) => (
            <View key={title} style={styles.module}>
              <Text style={styles.moduleIcon}>{icon}</Text>
              <Text style={styles.moduleTitle}>{title}</Text>
              <Text style={styles.moduleDetail}>{detail}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.footer}>WYZEN AI • VERSÃO 0.1.0 • CONTROLO SOB A TUA AUTORIZAÇÃO</Text>
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
  step: { flexDirection: "row", gap: 11, marginBottom: 12 },
  stepNumber: { color: "#8292FF", fontSize: 11, fontWeight: "900" },
  stepText: { color: "#C5CEE1", fontSize: 12, lineHeight: 18, flex: 1 },
  warning: { color: "#F2C879", fontSize: 11, marginVertical: 8 },
  speakButton: { backgroundColor: "#202F55", padding: 12, borderRadius: 10, alignItems: "center", marginTop: 8 },
  speakText: { color: "white", fontWeight: "700", fontSize: 12 },
  note: { color: "#8490AA", fontSize: 10, lineHeight: 15, marginTop: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  module: { width: "48%", minHeight: 105, backgroundColor: "#11192B", borderRadius: 15, padding: 14, borderWidth: 1, borderColor: "#202C43" },
  moduleIcon: { color: "#93A0FF", fontSize: 20, marginBottom: 8 },
  moduleTitle: { color: "white", fontWeight: "800", fontSize: 13 },
  moduleDetail: { color: "#8793AC", fontSize: 10, marginTop: 4 },
  footer: { color: "#5E6A82", fontSize: 8, textAlign: "center", marginTop: 28, letterSpacing: 1 }
});
