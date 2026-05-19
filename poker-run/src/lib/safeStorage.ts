import { Platform } from "react-native";

export type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const memoryStore = new Map<string, string>();
let resolvedStorage: StorageAdapter | null = null;
let hasWarnedAboutAsyncStorage = false;

export function getSafeStorage(): StorageAdapter {
  if (resolvedStorage) {
    return resolvedStorage;
  }

  if (Platform.OS === "web") {
    resolvedStorage = createWebStorage();
    return resolvedStorage;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require("@react-native-async-storage/async-storage") as unknown;
    const maybeDefault = module as { default?: StorageAdapter };
    const nativeStorage = maybeDefault.default ?? (module as StorageAdapter);

    if (isStorageAdapter(nativeStorage)) {
      resolvedStorage = createGuardedStorage(nativeStorage);
      return resolvedStorage;
    }
  } catch (error) {
    warnAboutAsyncStorage(error);
  }

  resolvedStorage = createMemoryStorage();
  return resolvedStorage;
}

function createGuardedStorage(storage: StorageAdapter): StorageAdapter {
  const fallback = createMemoryStorage();

  return {
    async getItem(key) {
      try {
        return await storage.getItem(key);
      } catch (error) {
        warnAboutAsyncStorage(error);
        return fallback.getItem(key);
      }
    },
    async setItem(key, value) {
      try {
        await storage.setItem(key, value);
      } catch (error) {
        warnAboutAsyncStorage(error);
        await fallback.setItem(key, value);
      }
    },
    async removeItem(key) {
      try {
        await storage.removeItem(key);
      } catch (error) {
        warnAboutAsyncStorage(error);
        await fallback.removeItem(key);
      }
    },
  };
}

function createMemoryStorage(): StorageAdapter {
  return {
    async getItem(key) {
      return memoryStore.get(key) ?? null;
    },
    async setItem(key, value) {
      memoryStore.set(key, value);
    },
    async removeItem(key) {
      memoryStore.delete(key);
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

function isStorageAdapter(value: unknown): value is StorageAdapter {
  const candidate = value as Partial<StorageAdapter>;
  return (
    typeof candidate?.getItem === "function" &&
    typeof candidate.setItem === "function" &&
    typeof candidate.removeItem === "function"
  );
}

function warnAboutAsyncStorage(error: unknown) {
  if (hasWarnedAboutAsyncStorage) {
    return;
  }

  hasWarnedAboutAsyncStorage = true;
  console.warn(
    "AsyncStorage native module is unavailable; falling back to in-memory storage.",
    error
  );
}
