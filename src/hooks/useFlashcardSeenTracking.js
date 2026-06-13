import { useEffect, useMemo, useRef } from "react";
import { actionTypes } from "../state/actionTypes";

export function useFlashcardSeenTracking({ dispatch, activeTrackId, session, currentFlashcard }) {
  const flashcardSeenRef = useRef(null);

  useEffect(() => {
    if (!currentFlashcard || session.screen !== "flashcards") {
      return;
    }

    const seenKey = `${session.screen}:${session.flashcards?.currentIndex}:${currentFlashcard.id}`;

    if (flashcardSeenRef.current === seenKey) {
      return;
    }

    flashcardSeenRef.current = seenKey;
    dispatch({
      type: actionTypes.markWordSeen,
      payload: {
        wordId: currentFlashcard.id,
        seenAt: Date.now()
      },
      meta: {
        trackId: activeTrackId
      }
    });
  }, [activeTrackId, currentFlashcard, dispatch, session.flashcards?.currentIndex, session.screen]);
}
