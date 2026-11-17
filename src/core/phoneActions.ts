import { Alert, Platform, PermissionsAndroid } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import * as Contacts from "expo-contacts";
import * as SMS from "expo-sms";
import * as Calendar from "expo-calendar";
import * as Notifications from "expo-notifications";

export type PendingPhoneAction =
  | { type: "sms"; phone: string; message: string }
  | { type: "call"; phone: string }
  | { type: "reminder"; title: string; date: Date };

export function parsePhoneCommand(input: string): PendingPhoneAction | null {
  const s = input.trim();
  let m = s.match(/^(?:liga|telefonar|chama)\s+(?:para\s+)?([+\d][\d\s()-]{5,})$/i);
  if (m) return { type: "call", phone: m[1].replace(/[\s()-]/g, "") };
  m = s.match(/^(?:sms|mensagem)\s+(?:para\s+)?([+\d][\d\s()-]{5,})\s*[:;,]\s*(.+)$/i);
  if (m) return { type: "sms", phone: m[1].replace(/[\s()-]/g, ""), message: m[2].trim() };
  m = s.match(/^(?:lembra-me|cria lembrete|agenda tarefa)\s+(?:de\s+)?(.+?)\s+(?:às|as)\s+(\d{1,2})[:h](\d{2})$/i);
  if (m) {
    const date = new Date();
    date.setHours(Number(m[2]), Number(m[3]), 0, 0);
    if (date.getTime() <= Date.now()) date.setDate(date.getDate()+1);
    return { type: "reminder", title: m[1].trim(), date };
  }
  return null;
}

export async function findContact(name: string): Promise<string> {
  const permission = await Contacts.requestPermissionsAsync();
  if (!permission.granted) throw new Error("Permite o acesso aos contactos nas definições do Android.");
  const result = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
    name
  });
  const contact = result.data.find(c => c.phoneNumbers?.length);
  const phone = contact?.phoneNumbers?.[0]?.number;
  if (!phone) throw new Error("Não encontrei um contacto com número de telefone.");
  return phone;
}

export async function performPhoneAction(action: PendingPhoneAction): Promise<string> {
  if (action.type === "call") {
    if (Platform.OS !== "android") throw new Error("A chamada direta está disponível apenas no Android.");
    const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CALL_PHONE, {
      title: "Permissão para chamadas da WYZEN",
      message: "A WYZEN precisa de autorização para iniciar a chamada que acabaste de confirmar.",
      buttonPositive: "Permitir",
      buttonNegative: "Cancelar"
    });
    if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error("A chamada não foi iniciada: a permissão para telefonar não foi concedida.");
    }
    await IntentLauncher.startActivityAsync("android.intent.action.CALL", {
      data: `tel:${action.phone}`
    });
    return "O Android recebeu o pedido para iniciar a chamada. A ligação pode depender da rede e do estado do SIM.";
  }
  if (action.type === "sms") {
    const available = await SMS.isAvailableAsync();
    if (!available) throw new Error("O envio de SMS não está disponível neste dispositivo.");
    await SMS.sendSMSAsync([action.phone], action.message);
    return "Abri a aplicação de SMS com o destinatário e a mensagem. Confirma o envio no Android.";
  }
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error("Permite notificações para receber lembretes.");
  const calendarPermission = await Calendar.requestCalendarPermissionsAsync();
  if (calendarPermission.granted) {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const target = calendars.find(c => c.allowsModifications && (c.isPrimary || c.source?.type === "LOCAL")) ||
      calendars.find(c => c.allowsModifications);
    if (target) {
      const endDate = new Date(action.date.getTime()+30*60*1000);
      await Calendar.createEventAsync(target.id, { title: action.title, startDate: action.date, endDate, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    }
  }
  await Notifications.scheduleNotificationAsync({
    content: { title: "WYZEN AI", body: action.title },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: action.date }
  });
  return "Lembrete criado para " + action.date.toLocaleString("pt-PT") + ".";
}

export function confirmPhoneAction(action: PendingPhoneAction, onConfirm: () => void) {
  const description = action.type === "call"
    ? "Abrir o marcador para " + action.phone + "?"
    : action.type === "sms"
      ? "Preparar SMS para " + action.phone + ": " + action.message
      : "Criar o lembrete “" + action.title + "” para " + action.date.toLocaleString("pt-PT") + "?";
  Alert.alert("Confirmar ação", description, [
    { text: "Cancelar", style: "cancel" },
    { text: "Continuar", onPress: onConfirm }
  ]);
}
