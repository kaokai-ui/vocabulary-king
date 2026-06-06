import {
  defaultProgress,
  defaultSession,
  readStoredValue,
  STORAGE_KEYS,
  writeStoredValue
} from "./storage";

const DB_NAME = "vocabulary-king";
const DB_VERSION = 1;
const STORE_NAME = "kv";

function isIndexedDbSupported() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbSupported()) {
      reject(new Error("IndexedDB is not supported"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open IndexedDB"));
    };
  });
}

function readFromStore(key) {
  return openDatabase().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Failed to read IndexedDB value"));
        transaction.oncomplete = () => database.close();
      })
  );
}

function writeToStore(key, value) {
  return openDatabase().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(value, key);

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error ?? new Error("Failed to write IndexedDB value"));
        transaction.oncomplete = () => database.close();
      })
  );
}

function readLocalFallbackState() {
  return {
    progress: readStoredValue(STORAGE_KEYS.progress, defaultProgress),
    session: readStoredValue(STORAGE_KEYS.session, defaultSession)
  };
}

export async function loadPersistedAppState() {
  const fallback = readLocalFallbackState();

  if (!isIndexedDbSupported()) {
    return {
      ...fallback,
      storageMode: "localstorage"
    };
  }

  try {
    const persisted = await readFromStore(STORAGE_KEYS.appState);

    if (!persisted) {
      return {
        ...fallback,
        storageMode: "localstorage"
      };
    }

    return {
      progress: {
        ...defaultProgress,
        ...(persisted.progress ?? {})
      },
      session: {
        ...defaultSession,
        ...(persisted.session ?? {})
      },
      storageMode: "indexeddb"
    };
  } catch (error) {
    return {
      ...fallback,
      storageMode: "localstorage"
    };
  }
}

export async function savePersistedAppState({ progress, session }) {
  const payload = { progress, session };

  writeStoredValue(STORAGE_KEYS.progress, progress);
  writeStoredValue(STORAGE_KEYS.session, session);

  if (!isIndexedDbSupported()) {
    return "localstorage";
  }

  try {
    await writeToStore(STORAGE_KEYS.appState, payload);
    return "indexeddb";
  } catch (error) {
    return "localstorage";
  }
}
