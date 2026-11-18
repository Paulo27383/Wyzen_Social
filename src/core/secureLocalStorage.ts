import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { gcm } from "@noble/ciphers/aes.js";

const KEY_STORAGE_NAME = "wyzen.local.data.key.v1";
const ENVELOPE_PREFIX = "wyzen.enc.v1:";
const NONCE_BYTES = 12;
let keyPromise: Promise<Uint8Array> | null = null;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array {
  if (!value || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) {
    throw new Error("Registo cifrado inválido.");
  }
  const result = new Uint8Array(value.length / 2);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return result;
}

function utf8ToBytes(value: string): Uint8Array {
  const encoded = unescape(encodeURIComponent(value));
  const result = new Uint8Array(encoded.length);
  for (let index = 0; index < encoded.length; index += 1) {
    result[index] = encoded.charCodeAt(index);
  }
  return result;
}

function bytesToUtf8(value: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < value.length; index += 1) {
    binary += String.fromCharCode(value[index]);
  }
  return decodeURIComponent(escape(binary));
}

async function getEncryptionKey(): Promise<Uint8Array> {
  if (!keyPromise) {
    keyPromise = (async () => {
      let stored = await SecureStore.getItemAsync(KEY_STORAGE_NAME);
      if (!stored) {
        stored = bytesToHex(Crypto.getRandomBytes(32));
        await SecureStore.setItemAsync(KEY_STORAGE_NAME, stored);
      }
      const key = hexToBytes(stored);
      if (key.length !== 32) {
        throw new Error("A chave local da WYZEN tem um formato inválido.");
      }
      return key;
    })().catch(error => {
      keyPromise = null;
      throw error;
    });
  }
  return keyPromise;
}

async function encrypt(value: string, storageKey: string): Promise<string> {
  const key = await getEncryptionKey();
  const nonce = Crypto.getRandomBytes(NONCE_BYTES);
  const additionalData = utf8ToBytes(storageKey);
  const ciphertext = gcm(key, nonce, additionalData).encrypt(utf8ToBytes(value));
  return ENVELOPE_PREFIX + bytesToHex(nonce) + ":" + bytesToHex(ciphertext);
}

async function decrypt(value: string, storageKey: string): Promise<string> {
  const parts = value.slice(ENVELOPE_PREFIX.length).split(":");
  if (parts.length !== 2) throw new Error("Formato de memória cifrada inválido.");
  const nonce = hexToBytes(parts[0]);
  if (nonce.length !== NONCE_BYTES) throw new Error("Nonce de memória inválido.");
  const key = await getEncryptionKey();
  const plaintext = gcm(key, nonce, utf8ToBytes(storageKey)).decrypt(hexToBytes(parts[1]));
  return bytesToUtf8(plaintext);
}

/**
 * AsyncStorage adapter with transparent AES-256-GCM encryption.
 * Existing plaintext records are encrypted the first time they are read.
 * The AES key is stored separately in Android Keystore through SecureStore.
 */
export const secureLocalStorage = {
  async getItem(storageKey: string): Promise<string | null> {
    const stored = await AsyncStorage.getItem(storageKey);
    if (stored === null) return null;
    if (stored.startsWith(ENVELOPE_PREFIX)) {
      return decrypt(stored, storageKey);
    }

    // Lazy migration: preserve the old value unless encryption succeeds.
    const encrypted = await encrypt(stored, storageKey);
    await AsyncStorage.setItem(storageKey, encrypted);
    return stored;
  },

  async setItem(storageKey: string, value: string): Promise<void> {
    const encrypted = await encrypt(value, storageKey);
    await AsyncStorage.setItem(storageKey, encrypted);
  },

  removeItem(storageKey: string): Promise<void> {
    return AsyncStorage.removeItem(storageKey);
  }
};
