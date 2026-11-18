import { requireNativeModule, EventEmitter } from "expo-modules-core";
import { Platform } from "react-native";

type NativeWakeWord = {
  start(): Promise<boolean>;
  stop(): Promise<boolean>;
  isAvailable(): Promise<boolean>;
};

type NativeEventEmitter = {
  addListener(eventName: string, listener: (...args: unknown[]) => void): { remove(): void };
};

const Native = Platform.OS === "android" ? requireNativeModule<NativeWakeWord>("WyzenWakeWord") : null;
const emitter = Native
  ? new EventEmitter(Native as never) as unknown as NativeEventEmitter
  : null;

export const startWyzenWakeWord = async () => {
  if (!Native) throw new Error("A ativação em segundo plano só está disponível na versão Android nativa.");
  return Native.start();
};

export const stopWyzenWakeWord = async () => Native?.stop() ?? false;

export const addWakeWordListener = (listener: () => void) =>
  emitter?.addListener("onWakeWordDetected", listener) ?? { remove() {} };

export const addWakeWordStatusListener = (listener: (event: { event: string }) => void) =>
  emitter?.addListener("onWakeWordStatus", listener as (...args: unknown[]) => void) ?? { remove() {} };
