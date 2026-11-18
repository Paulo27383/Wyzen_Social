import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Props = {
  visible: boolean;
  busy: boolean;
  listening: boolean;
  voiceEnabled: boolean;
  modelReady: boolean;
  onClose: () => void;
  onCommand: (command: string) => void;
};

const MODULES = [
  { code: "01", title: "TAREFAS", detail: "Consultar operações pendentes", command: "mostra tarefas", color: "#00D5FF" },
  { code: "02", title: "MEMÓRIA", detail: "Aceder às informações guardadas", command: "consulta a memória", color: "#B69BFF" },
  { code: "03", title: "AGENDA", detail: "Ver compromissos de hoje", command: "o que tenho hoje", color: "#48E0B2" },
  { code: "04", title: "RELATÓRIO DIÁRIO", detail: "Rever a atividade de hoje", command: "resumo de hoje", color: "#FF7896" }
];

export default function WyzenCommandDeck(props: Props) {
  const { visible, busy, listening, voiceEnabled, modelReady, onClose, onCommand } = props;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <View style={styles.header}>
            <View>
              <Text style={styles.kicker}>WYZEN AI / INTERFACE TÁTICA</Text>
              <Text style={styles.title}>COMMAND DECK</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar painel de comando" onPress={onClose} style={styles.close}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.core}>
            <View style={styles.coreRing}><Text style={styles.coreW}>W</Text></View>
            <View style={styles.coreInfo}>
              <Text style={styles.coreLabel}>NÚCLEO WYZEN</Text>
              <Text style={styles.coreState}>{busy ? "A PROCESSAR" : listening ? "A OUVIR" : "OPERACIONAL"}</Text>
              <Text style={styles.coreHint}>Interface adicional · controlo local</Text>
            </View>
          </View>

          <Text style={styles.section}>MÓDULOS DISPONÍVEIS</Text>
          <ScrollView contentContainerStyle={styles.moduleList} showsVerticalScrollIndicator={false}>
            {MODULES.map(item => (
              <Pressable key={item.code} disabled={busy} onPress={() => onCommand(item.command)}
                style={({ pressed }) => [styles.module, pressed && styles.pressed, busy && styles.disabled]}>
                <View style={[styles.moduleCode, { borderColor: item.color }]}><Text style={[styles.codeText, { color: item.color }]}>{item.code}</Text></View>
                <View style={styles.moduleCopy}>
                  <Text style={styles.moduleTitle}>{item.title}</Text>
                  <Text style={styles.moduleDetail}>{item.detail}</Text>
                </View>
                <Text style={[styles.moduleArrow, { color: item.color }]}>›</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.section}>ESTADO DOS SISTEMAS</Text>
          <View style={styles.statusGrid}>
            <View style={styles.statusItem}><Text style={styles.statusValue}>{voiceEnabled ? "ON" : "OFF"}</Text><Text style={styles.statusLabel}>VOZ CONTÍNUA</Text></View>
            <View style={styles.statusItem}><Text style={styles.statusValue}>{modelReady ? "LOCAL" : "BÁSICO"}</Text><Text style={styles.statusLabel}>MOTOR IA</Text></View>
            <View style={styles.statusItem}><Text style={styles.statusValue}>{listening ? "ATIVO" : "PAUSA"}</Text><Text style={styles.statusLabel}>MICROFONE</Text></View>
          </View>

          <Pressable onPress={() => onCommand(voiceEnabled ? "desativa voz contínua" : "ativa voz contínua")} disabled={busy}
            style={({ pressed }) => [styles.voiceButton, pressed && styles.pressed, busy && styles.disabled]}>
            <Text style={styles.voiceText}>{voiceEnabled ? "DESATIVAR ESCUTA CONTÍNUA" : "ATIVAR ESCUTA CONTÍNUA"}</Text>
          </Pressable>
          <Text style={styles.footer}>WYZEN · SISTEMA DE COMANDO PESSOAL</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(1, 4, 12, 0.94)", justifyContent: "center", padding: 16 },
  panel: { maxHeight: "94%", borderWidth: 1, borderColor: "rgba(0, 213, 255, 0.42)", borderRadius: 22, backgroundColor: "#07111D", padding: 19, overflow: "hidden" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 17 },
  kicker: { color: "#6C9EB7", fontSize: 8, fontWeight: "800", letterSpacing: 2 },
  title: { color: "#F1F8FF", fontSize: 21, fontWeight: "900", letterSpacing: 3, marginTop: 5 },
  close: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: "#37536A", alignItems: "center", justifyContent: "center" },
  closeText: { color: "#D6E9F7", fontSize: 25, lineHeight: 28 },
  core: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 16, backgroundColor: "rgba(0, 213, 255, 0.07)", borderWidth: 1, borderColor: "rgba(0, 213, 255, 0.18)", marginBottom: 20 },
  coreRing: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderColor: "#00D5FF", alignItems: "center", justifyContent: "center", marginRight: 14, shadowColor: "#00D5FF", shadowOpacity: 0.65, shadowRadius: 12 },
  coreW: { color: "#F4FBFF", fontSize: 39, fontWeight: "900", fontStyle: "italic" },
  coreInfo: { flex: 1 },
  coreLabel: { color: "#8CB4C8", fontSize: 9, fontWeight: "800", letterSpacing: 2 },
  coreState: { color: "#5DE8C0", fontSize: 16, fontWeight: "900", letterSpacing: 1.5, marginTop: 3 },
  coreHint: { color: "#7890A5", fontSize: 10, marginTop: 4 },
  section: { color: "#789AB1", fontSize: 9, fontWeight: "900", letterSpacing: 2, marginBottom: 9 },
  moduleList: { gap: 8, paddingBottom: 18 },
  module: { minHeight: 62, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#1B3448", borderRadius: 13, backgroundColor: "#0A1A29", paddingHorizontal: 11, paddingVertical: 9 },
  moduleCode: { width: 34, height: 34, borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center", marginRight: 11 },
  codeText: { fontSize: 10, fontWeight: "900" },
  moduleCopy: { flex: 1 },
  moduleTitle: { color: "#E7F2FA", fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  moduleDetail: { color: "#8198AA", fontSize: 10, marginTop: 4 },
  moduleArrow: { fontSize: 25, marginLeft: 8 },
  statusGrid: { flexDirection: "row", gap: 7, marginBottom: 14 },
  statusItem: { flex: 1, paddingVertical: 11, borderRadius: 11, backgroundColor: "#0B1B2A", borderWidth: 1, borderColor: "#1A3447", alignItems: "center" },
  statusValue: { color: "#62DCCB", fontSize: 12, fontWeight: "900" },
  statusLabel: { color: "#718A9D", fontSize: 7, fontWeight: "800", letterSpacing: 0.7, marginTop: 5 },
  voiceButton: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: "rgba(0, 213, 255, 0.5)", backgroundColor: "rgba(0, 213, 255, 0.1)", alignItems: "center", justifyContent: "center" },
  voiceText: { color: "#66DFFF", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
  footer: { color: "#536D80", fontSize: 8, letterSpacing: 1.4, textAlign: "center", marginTop: 15 }
});
