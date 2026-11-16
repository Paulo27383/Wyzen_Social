import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    })
  : null;

export async function getWyzenAccessToken(): Promise<string> {
  if (!supabase) {
    throw new Error("Configura a URL e a chave pública do Supabase no ficheiro .env.");
  }

  let { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Falha ao recuperar sessão Supabase: ${error.message}`);

  if (!session) {
    const result = await supabase.auth.signInAnonymously();
    if (result.error) {
      throw new Error(
        "Não foi possível iniciar sessão anónima. Ativa Anonymous Sign-Ins no Supabase Auth. " +
        result.error.message
      );
    }
    session = result.data.session;
  }

  if (!session?.access_token) {
    throw new Error("O Supabase não devolveu um token de sessão válido.");
  }

  return session.access_token;
}
