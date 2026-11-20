import * as FileSystem from "expo-file-system/legacy";
import { initLlama, type LlamaContext } from "llama.rn";

const MODEL_DIR = `${FileSystem.documentDirectory ?? ""}wyzen-models/`;
const MODEL_FILE = "SmolLM2-360M-Instruct-Q4_K_M.gguf";
const MODEL_PATH = MODEL_DIR + MODEL_FILE;
const TEMP_MODEL_PATH = MODEL_PATH + ".download";
const MODEL_URL =
  "https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf";
const MIN_MODEL_BYTES = 10 * 1024 * 1024;

let context: LlamaContext | null = null;
let loading: Promise<LlamaContext> | null = null;
let activeGenerations = 0;
let unloadRequested = false;

export type LocalModelStatus = {
  available: boolean;
  downloaded: boolean;
  model: string;
  approximateDownloadMB: number;
};

async function hasValidModelFile(path = MODEL_PATH): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(path);
  return !!info.exists && !info.isDirectory &&
    typeof info.size === "number" && info.size >= MIN_MODEL_BYTES;
}

export async function getLocalModelStatus(): Promise<LocalModelStatus> {
  return {
    available: true,
    downloaded: await hasValidModelFile(),
    model: "SmolLM2 360M Instruct (Q4_K_M)",
    approximateDownloadMB: 271
  };
}

/** Downloads to a temporary file and only publishes it after basic integrity checks. */
export async function downloadLocalModel(
  onProgress?: (progress: number) => void
): Promise<void> {
  await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });

  if (await hasValidModelFile()) return;
  await FileSystem.deleteAsync(MODEL_PATH, { idempotent: true });
  await FileSystem.deleteAsync(TEMP_MODEL_PATH, { idempotent: true });

  const download = FileSystem.createDownloadResumable(
    MODEL_URL,
    TEMP_MODEL_PATH,
    {},
    progress => {
      const total = progress.totalBytesExpectedToWrite;
      if (total > 0) onProgress?.(Math.min(1, progress.totalBytesWritten / total));
    }
  );

  try {
    const result = await download.downloadAsync();
    if (!result?.uri || result.status < 200 || result.status >= 300) {
      throw new Error("O servidor não concluiu o download do modelo.");
    }
    if (!(await hasValidModelFile(TEMP_MODEL_PATH))) {
      throw new Error("O ficheiro descarregado está incompleto ou é inválido.");
    }
    await FileSystem.moveAsync({ from: TEMP_MODEL_PATH, to: MODEL_PATH });
    if (!(await hasValidModelFile())) {
      throw new Error("Não foi possível validar o ficheiro instalado.");
    }
  } catch (error) {
    await FileSystem.deleteAsync(TEMP_MODEL_PATH, { idempotent: true });
    await FileSystem.deleteAsync(MODEL_PATH, { idempotent: true });
    throw error;
  }
}

async function loadModel(): Promise<LlamaContext> {
  if (context) return context;
  if (loading) return loading;

  loading = (async () => {
    if (!(await hasValidModelFile())) {
      throw new Error("O modelo local não está instalado ou o ficheiro está incompleto. Volta a descarregá-lo.");
    }
    const loaded = await initLlama({
      model: MODEL_PATH,
      n_ctx: 1024,
      n_batch: 32,
      n_threads: 2,
      n_gpu_layers: 0,
      use_mmap: true,
      use_mlock: false
    });
    context = loaded;
    return loaded;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}

/** Loads the native GGUF runtime and performs a tiny inference before reporting installation success. */
export async function verifyLocalModel(): Promise<void> {
  const model = await loadModel();
  try {
    const result = await model.completion({
      messages: [{ role: "user", content: "Responde apenas: OK." }],
      n_predict: 8,
      temperature: 0
    });
    if (!result.text.trim()) {
      throw new Error("O modelo foi carregado, mas não conseguiu gerar uma resposta de teste.");
    }
  } finally {
    await unloadLocalModel();
  }
}

export async function removeLocalModel(): Promise<void> {
  await unloadLocalModel();
  await FileSystem.deleteAsync(MODEL_PATH, { idempotent: true });
  await FileSystem.deleteAsync(TEMP_MODEL_PATH, { idempotent: true });
}

export async function generateLocalResponse(
  message: string,
  memory = ""
): Promise<string> {
  const model = await loadModel();
  activeGenerations += 1;
  unloadRequested = false;
  try {
    const system = [
      "És a WYZEN, uma assistente pessoal que responde em português claro.",
      "Compreende o objetivo do utilizador. Se não souberes executar uma ação, explica isso sem fingir que a executaste.",
      "Nunca afirmes que uma chamada, mensagem, compra, eliminação ou outra ação foi realizada sem confirmação do motor de execução.",
      memory ? `Contexto guardado pelo utilizador: ${memory}` : ""
    ].filter(Boolean).join("\n");

    const result = await model.completion({
      messages: [
        { role: "system", content: system },
        { role: "user", content: message }
      ],
      n_predict: 160,
      temperature: 0.65,
      top_p: 0.9
    });

    return result.text.trim();
  } finally {
    activeGenerations = Math.max(0, activeGenerations - 1);
    if (activeGenerations === 0 && unloadRequested) {
      const current = context;
      context = null;
      unloadRequested = false;
      if (current) await current.release();
    }
  }
}

export async function unloadLocalModel(): Promise<void> {
  if (activeGenerations > 0) {
    unloadRequested = true;
    return;
  }
  if (loading) {
    try { await loading; } catch { return; }
  }
  if (!context) return;
  const current = context;
  context = null;
  await current.release();
}
