import { useEffect } from "react";
import { getTrackProgress, isTrackProgressEqual, migrateTrackProgress } from "../lib/progress";
import { actionTypes } from "../state/actionTypes";

export function useTrackProgressSync({ dispatch, isPersistenceReady, progress, vocabulary, activeTrackId }) {
  const activeProgress = getTrackProgress(progress, activeTrackId);

  useEffect(() => {
    if (!isPersistenceReady || vocabulary.length === 0) {
      return;
    }

    const migratedProgress = migrateTrackProgress(activeProgress, vocabulary);

    if (isTrackProgressEqual(activeProgress, migratedProgress) && progress.byTrack?.[activeTrackId]) {
      return;
    }

    dispatch({
      type: actionTypes.syncTrackProgress,
      payload: {
        trackId: activeTrackId,
        progress: migratedProgress
      }
    });
  }, [activeProgress, activeTrackId, dispatch, isPersistenceReady, progress.byTrack, vocabulary]);

  return { activeProgress };
}
