import "react-native-url-polyfill/auto";

import { Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
  );
}

type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

function createMemoryStorage(): StorageAdapter {
  const store = new Map<string, string>();

  return {
    async getItem(key) {
      return store.get(key) ?? null;
    },
    async setItem(key, value) {
      store.set(key, value);
    },
    async removeItem(key) {
      store.delete(key);
    },
  };
}

function createWebStorage(): StorageAdapter {
  return {
    async getItem(key) {
      return globalThis.localStorage?.getItem(key) ?? null;
    },
    async setItem(key, value) {
      globalThis.localStorage?.setItem(key, value);
    },
    async removeItem(key) {
      globalThis.localStorage?.removeItem(key);
    },
  };
}

function resolveStorage(): StorageAdapter {
  if (Platform.OS === "web") {
    return createWebStorage();
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@react-native-async-storage/async-storage").default as StorageAdapter;
  } catch (error) {
    console.warn("AsyncStorage native module unavailable, falling back to in-memory auth storage.", error);
    return createMemoryStorage();
  }
}

const storage = resolveStorage();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
