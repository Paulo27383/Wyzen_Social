import * as FileSystem from "expo-file-system/legacy";
import { initLlama, type LlamaContext } from "llama.rn";

const MODEL_DIR = `${FileSystem.documentDirectory ?? ""}wyzen-models/`;
const MODEL_FILE = "SmolLM2-360M-Instruct-Q4_K_M.gguf";
const MODEL_PATH = MODEL_DIR + MODEL_FILE;
const TEMP_MODEL_PATH = MODEL_PATH + ".part";
const MODEL_URL =
  "https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf";

// The published file is approximately 271 MB. This lower bound rejects truncated
// downloads without depending on a hard-coded checksum that we have not verified.
const MIN_MODEL_BYTES = 200 * 1024 * 1024;
const GGUF_MAGIC_BASE64 = "R0dVRg==";

let context: LlamaContext | null = null;
let loading: Promise<LlamaContext> | null = null;

export type LocalModelStatus = {
  available: boolean;
  downloaded: boolean;
  model: string;
  approximateDownloadMB: number;
};

async function isValidModelFile(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory || !("size" in info) || (info.size ?? 0) < MIN_MODEL_BYTES) {
      return false;
    }

    const header = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 4
    });
    return header === GGUF_MAGIC_BASE64;
  } catch {
    return false;
  }
}

export async function getLocalModelStatus(): Promise<LocalModelStatus> {
  return {
    available: true,
    downloaded: await isValidModelFile(MODEL_PATH),
    model: "SmolLM2 360M Instruct (Q4_K_M)",
    approximateDownloadMB: 271
  };
}

/** Downloads to a temporary file and publishes it only after basic integrity checks. */
export async function downloadLocalModel(
  onProgress?: (progress: number) => void
): Promise<void> {
  await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });

  if (await isValidModelFile(MODEL_PATH)) return;

  // Never treat an old or interrupted .part file as an installed model.
  await FileSystem.deleteAsync(TEMP_MODEL_PATH, { idempotent: true });

  const download = FileSystem.createDownloadResumable(
    MODEL_URL,
    TEMP_MODEL_PATH,
    {},
    progress => {
      const total = progress.totalBytesExpectedToWrite;
      if (total > 0) onProgress?.(progress.totalBytesWritten / total);
    }
  );

  try {
    const result = await download.downloadAsync();
    if (!result?.uri || result.status < 200 || result.status >= 300) {
      throw new Error(`O servidor não concluiu o download do modelo (HTTP ${result?.status ?? "sem resposta"}).`);
    }

    const info = await FileSystem.getInfoAsync(TEMP_MODEL_PATH);
    const size = info.exists && "size" in info ? (info.size ?? 0) : 0;
    if (size < MIN_MODEL_BYTES) {
      throw new Error("O ficheiro recebido está incompleto ou é demasiado pequeno. Verifica a ligação e tenta novamente.");
    }

    if (!(await isValidModelFile(TEMP_MODEL_PATH))) {
      throw new Error("O ficheiro recebido não tem um cabeçalho GGUF válido.");
    }

    // Replace any invalid previous file only after the new download passes validation.
    await FileSystem.deleteAsync(MODEL_PATH, { idempotent: true });
    await FileSystem.moveAsync({ from: TEMP_MODEL_PATH, to: MODEL_PATH });

    if (!(await isValidModelFile(MODEL_PATH))) {
      await FileSystem.deleteAsync(MODEL_PATH, { idempotent: true });
      throw new Error("Não foi possível validar o modelo depois de o guardar.");
    }
  } catch (error) {
    await FileSystem.deleteAsync(TEMP_MODEL_PATH, { idempotent: true });
    throw error;
  }
}

async function loadModel(): Promise<LlamaContext> {
  if (context) return context;
  if (loading) return loading;

  loading = (async () => {
    const status = await getLocalModelStatus();
    if (!status.downloaded) {
      throw new Error("O modelo local não está instalado ou o ficheiro está incompleto. Inicia novamente o download.");
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
