import * as FileSystem from "expo-file-system/legacy";
import { initLlama, type LlamaContext } from "llama.rn";

const MODEL_DIR = `${FileSystem.documentDirectory ?? ""}wyzen-models/`;
const MODEL_FILE = "SmolLM2-360M-Instruct-Q4_K_M.gguf";
const MODEL_PATH = MODEL_DIR + MODEL_FILE;
const MODEL_URL =
  "https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf";

let context: LlamaContext | null = null;
let loading: Promise<LlamaContext> | null = null;

export type LocalModelStatus = {
  available: boolean;
  downloaded: boolean;
  model: string;
  approximateDownloadMB: number;
};

export async function getLocalModelStatus(): Promise<LocalModelStatus> {
  const info = await FileSystem.getInfoAsync(MODEL_PATH);
  return {
    available: true,
    downloaded: info.exists && !info.isDirectory,
    model: "SmolLM2 360M Instruct (Q4_K_M)",
    approximateDownloadMB: 271
  };
}

/** Downloads the model only when explicitly requested by the user. */
export async function downloadLocalModel(
  onProgress?: (progress: number) => void
): Promise<void> {
  await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
  const existing = await FileSystem.getInfoAsync(MODEL_PATH);
  if (existing.exists) return;

  const download = FileSystem.createDownloadResumable(
    MODEL_URL,
    MODEL_PATH,
    {},
    progress => {
      const total = progress.totalBytesExpectedToWrite;
      if (total > 0) onProgress?.(progress.totalBytesWritten / total);
    }
  );

  try {
    const result = await download.downloadAsync();
    if (!result?.uri) throw new Error("O download do modelo não foi concluído.");
  } catch (error) {
    const partial = await FileSystem.getInfoAsync(MODEL_PATH);
    if (partial.exists) await FileSystem.deleteAsync(MODEL_PATH, { idempotent: true });
    throw error;
  }
}

async function loadModel(): Promise<LlamaContext> {
  if (context) return context;
  if (loading) return loading;

  loading = (async () => {
    const status = await getLocalModelStatus();
    if (!status.downloaded) {
      throw new Error("O modelo local ainda não foi descarregado. É necessário iniciar o download primeiro.");
    }
    const loaded = await initLlama({
      model: MODEL_PATH,
      n_ctx: 1024,
      n_batch: 64,
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

export async function generateLocalResponse(
  message: string,
  memory = ""
): Promise<string> {
  const model = await loadModel();
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
}

export async function unloadLocalModel(): Promise<void> {
  if (!context) return;
  const current = context;
  context = null;
  await current.release();
}
