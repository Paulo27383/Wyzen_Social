import { Linking, Platform } from "react-native";
import * as Contacts from "expo-contacts";
import * as Calendar from "expo-calendar";
import * as Notifications from "expo-notifications";
import * as IntentLauncher from "expo-intent-launcher";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

export type ControlResult = { handled: boolean; message?: string };

const APP_LINKS: Record<string, string[]> = {
  whatsapp: ["whatsapp://send", "https://wa.me/"],
  facebook: ["fb://", "https://www.facebook.com/"],
  instagram: ["instagram://app", "https://www.instagram.com/"],
  tiktok: ["snssdk1233://", "https://www.tiktok.com/"],
  gmail: ["googlegmail://", "https://mail.google.com/"],
  drive: ["googledrive://", "https://drive.google.com/"],
  calendar: ["content://com.android.calendar/time/", "https://calendar.google.com/"],
  maps: ["geo:0,0?q=", "https://maps.google.com/"],
  google: ["https://www.google.com/"]
};

const APP_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp", facebook: "Facebook", instagram: "Instagram",
  tiktok: "TikTok", gmail: "Gmail", drive: "Google Drive",
  calendar: "Google Calendar", maps: "Google Maps", google: "Pesquisa Google"
};

export async function openAuthorizedApp(alias: string): Promise<string> {
  const key = alias.toLocaleLowerCase("pt-PT").replace(/\s+/g, "");
  const candidates = APP_LINKS[key];
  if (!candidates) throw new Error("Essa aplicação ainda não está registada no Centro de Controlo.");
  for (const url of candidates) {
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return APP_LABELS[key] + " aberto.";
      }
    } catch { /* tenta o endereço web oficial como alternativa */ }
  }
  const fallback = candidates[candidates.length - 1];
  await Linking.openURL(fallback);
  return APP_LABELS[key] + " aberto no endereço disponível.";
}

const ANDROID_SETTINGS: Record<string, { action: string; label: string }> = {
  wifi: { action: "android.settings.WIFI_SETTINGS", label: "definições de Wi-Fi" },
  bluetooth: { action: "android.settings.BLUETOOTH_SETTINGS", label: "definições de Bluetooth" },
  localizacao: { action: "android.settings.LOCATION_SOURCE_SETTINGS", label: "definições de localização" },
  localização: { action: "android.settings.LOCATION_SOURCE_SETTINGS", label: "definições de localização" },
  ecrã: { action: "android.settings.DISPLAY_SETTINGS", label: "definições do ecrã" },
  ecra: { action: "android.settings.DISPLAY_SETTINGS", label: "definições do ecrã" },
  som: { action: "android.settings.SOUND_SETTINGS", label: "definições de som" },
  bateria: { action: "android.settings.BATTERY_SAVER_SETTINGS", label: "definições de bateria" },
  aplicações: { action: "android.settings.APPLICATION_SETTINGS", label: "gestão de aplicações" },
  aplicacoes: { action: "android.settings.APPLICATION_SETTINGS", label: "gestão de aplicações" },
  notificacoes: { action: "android.settings.APP_NOTIFICATION_SETTINGS", label: "definições de notificações" }
};

async function openAndroidSettings(section: string): Promise<string> {
  if (Platform.OS !== "android") throw new Error("Esta ação está disponível apenas no Android.");
  const key = section.toLocaleLowerCase("pt-PT").trim();
  const setting = ANDROID_SETTINGS[key];
  if (!setting) throw new Error("Definição não reconhecida. Disponíveis: Wi-Fi, Bluetooth, localização, ecrã, som, bateria, aplicações e notificações.");
  await IntentLauncher.startActivityAsync(setting.action);
  return "Abri as " + setting.label + ". A alteração fica sob o teu controlo no Android.";
}

export async function requestControlPermission(kind: string): Promise<string> {
  if (kind === "microfone") {
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return result.granted ? "Permissão do microfone concedida." : "Permissão do microfone recusada.";
  }
  if (kind === "contactos") {
    const result = await Contacts.requestPermissionsAsync();
    return result.granted ? "Permissão de contactos concedida." : "Permissão de contactos recusada.";
  }
  if (kind === "calendário" || kind === "calendario") {
    const result = await Calendar.requestCalendarPermissionsAsync();
    return result.granted ? "Permissão de calendário concedida." : "Permissão de calendário recusada.";
  }
  if (kind === "notificações" || kind === "notificacoes") {
    const result = await Notifications.requestPermissionsAsync();
    return result.granted ? "Permissão de notificações concedida." : "Permissão de notificações recusada.";
  }
  if (kind === "definições" || kind === "definicoes" || kind === "sistema") {
    if (Platform.OS === "android") await Linking.openSettings();
    else await Linking.openURL("app-settings:");
    return "Abri as definições da WYZEN no sistema.";
  }
  throw new Error("Permissão não reconhecida. Disponíveis: microfone, contactos, calendário e notificações.");
}

export function controlCenterHelp(): string {
  return [
    "CENTRO DE CONTROLO WYZEN",
    "Aplicações: abrir WhatsApp, Facebook, Instagram, TikTok, Gmail, Drive, Calendar, Maps ou Google.",
    "Permissões: autorizar microfone, contactos, calendário ou notificações.",
    "Sistema: abrir definições da WYZEN ou pedir: abre definições de Wi-Fi, Bluetooth, localização, ecrã, som, bateria, aplicações ou notificações.",
    "A WYZEN abre os painéis oficiais do Android; não liga/desliga rádios nem altera definições silenciosamente.",
    "Privacidade: cada permissão é pedida ao Android quando necessária; a WYZEN não contorna bloqueios do sistema.",
    "Limite atual: abrir aplicações e pedir permissões está disponível; controlar conteúdo interno de contas exige APIs oficiais e OAuth."
  ].join("\n");
}

export async function runControlCommand(input: string): Promise<ControlResult> {
  const text = input.trim();
  if (/^(?:centro de controlo|centro de controle|ajuda do centro de controlo)$/i.test(text)) {
    return { handled: true, message: controlCenterHelp() };
  }
  const settings = text.match(/^(?:abre|abrir|mostra|vai para) (?:as? )?(?:definições|definicoes|configurações|configuracoes) (?:do )?(wi-?fi|bluetooth|localização|localizacao|ecrã|ecra|som|bateria|aplicações|aplicacoes|notificações|notificacoes)$/i);
  if (settings) return { handled: true, message: await openAndroidSettings(settings[1]) };
  const open = text.match(/^(?:abre|abrir|inicia|iniciar)\s+(whatsapp|facebook|instagram|tiktok|gmail|google drive|drive|google calendar|calendar|calendário|maps|google maps|google)$/i);
  if (open) {
    const alias = open[1].toLocaleLowerCase("pt-PT").replace(/^google drive$/, "drive").replace(/^google calendar$/, "calendar").replace(/^calendário$/, "calendar").replace(/^google maps$/, "maps");
    return { handled: true, message: await openAuthorizedApp(alias) };
  }
  const permission = text.match(/^(?:autoriza|permitir|ativa permissão de)\s+(microfone|contactos|calendário|calendario|notificações|notificacoes|definições|definicoes|sistema)$/i);
  if (permission) return { handled: true, message: await requestControlPermission(permission[1]) };
  return { handled: false };
}
