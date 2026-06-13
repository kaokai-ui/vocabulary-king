import { useEffect, useState } from "react";
import { loadPersistedAppState, savePersistedAppState } from "../lib/persistence";
import { writeStoredValue, STORAGE_KEYS } from "../lib/storage";
import { actionTypes } from "../state/actionTypes";

export function usePersistedAppState({ dispatch, settings, progress, session }) {
  const [isPersistenceReady, setIsPersistenceReady] = useState(false);
  const [storageMode, setStorageMode] = useState("localstorage");

  useEffect(() => {
    let isCancelled = false;

    loadPersistedAppState().then((persistedState) => {
      if (isCancelled) {
        return;
      }

      dispatch({
        type: actionTypes.hydratePersistence,
        payload: {
          progress: persistedState.progress,
          session: persistedState.session
        }
      });

      setStorageMode(persistedState.storageMode);
      setIsPersistenceReady(true);
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    writeStoredValue(STORAGE_KEYS.settings, settings);
  }, [settings]);

  useEffect(() => {
    if (!isPersistenceReady) {
      return;
    }

    savePersistedAppState({ progress, session }).then((mode) => {
      setStorageMode(mode);
    });
  }, [isPersistenceReady, progress, session]);

  return { isPersistenceReady, storageMode };
}
