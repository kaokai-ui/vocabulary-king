import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { normalizeVocabularyTrack } from "../constants/vocabularyTracks";
import { messages } from "../i18n/messages";
import { countProgress, createPracticeDeck, getResumeScreen } from "../lib/appState";
import { trackEvent } from "../lib/analytics";
import { loadPersistedAppState, savePersistedAppState } from "../lib/persistence";
import { getTrackProgress, isTrackProgressEqual, migrateTrackProgress } from "../lib/progress";
import { isMasteredWord, shuffle } from "../lib/game";
import { speakWord, stopSpeaking } from "../lib/speech";
import { STORAGE_KEYS, writeStoredValue } from "../lib/storage";
import { actionTypes } from "../state/actionTypes";
import { appReducer, createInitialAppState } from "../state/appReducer";
import { useQuizSession } from "./useQuizSession";

export function useVocabularyApp(vocabulary) {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialAppState);
  const [isPersistenceReady, setIsPersistenceReady] = useState(false);
  const [storageMode, setStorageMode] = useState("localstorage");
  const sessionRef = useRef(state.session);
  const flashcardSeenRef = useRef(null);

  const { settings, progress, session, now, pronunciationMessage } = state;
  const activeTrackId = settings.vocabularyTrack;
  const activeProgress = useMemo(() => getTrackProgress(progress, activeTrackId), [progress, activeTrackId]);
  const text = messages[settings.locale] ?? messages.en;

  const vocabularyById = useMemo(
    () => Object.fromEntries(vocabulary.map((word) => [word.id, word])),
    [vocabulary]
  );

  const currentFlashcards = useMemo(
    () => session.flashcards?.wordIds?.map((wordId) => vocabularyById[wordId]).filter(Boolean) ?? [],
    [session.flashcards?.wordIds, vocabularyById]
  );

  const currentFlashcard =
    session.flashcards && currentFlashcards.length > 0
      ? currentFlashcards[session.flashcards.currentIndex % currentFlashcards.length]
      : null;

  const stats = useMemo(() => countProgress(activeProgress, vocabulary, isMasteredWord), [activeProgress, vocabulary]);
  const hasSavedSession = session.screen === "home" && Boolean(session.flashcards || session.quiz);
  const starredWords = activeProgress.starredWordIds.map((wordId) => vocabularyById[wordId]).filter(Boolean);
  const knownWords = (activeProgress.knownWordIds ?? []).map((wordId) => vocabularyById[wordId]).filter(Boolean);

  const { currentQuestion, timeLeftSeconds, startQuiz, handleQuizAnswer } = useQuizSession({
    dispatch,
    session,
    sessionRef,
    activeTrackId,
    vocabulary,
    now,
    settings
  });

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

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
  }, [activeProgress, activeTrackId, isPersistenceReady, progress.byTrack, vocabulary]);

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
  }, [activeTrackId, currentFlashcard, session.flashcards?.currentIndex, session.screen]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  function updateSetting(key, value) {
    const nextValue = key === "vocabularyTrack" ? normalizeVocabularyTrack(value) : value;

    if (key === "vocabularyTrack" && nextValue !== settings.vocabularyTrack) {
      trackEvent("select_vocabulary_track", {
        vocabulary_track: nextValue,
        previous_vocabulary_track: settings.vocabularyTrack,
        language: settings.locale,
        screen_name: session.screen
      });
    }

    dispatch({
      type: actionTypes.updateSetting,
      payload: { key, value: nextValue }
    });
  }

  function toggleSetting(key) {
    dispatch({
      type: actionTypes.toggleSetting,
      payload: key
    });
  }

  function toggleStarredWord(wordId) {
    dispatch({
      type: actionTypes.toggleStarredWord,
      payload: wordId,
      meta: {
        trackId: activeTrackId
      }
    });
  }

  function addStarredWords(wordIds) {
    dispatch({
      type: actionTypes.addStarredWords,
      payload: wordIds,
      meta: {
        trackId: activeTrackId
      }
    });
  }

  function toggleKnownWord(wordId) {
    dispatch({
      type: actionTypes.toggleKnownWord,
      payload: wordId,
      meta: {
        trackId: activeTrackId
      }
    });
  }

  async function pronounce(textToSpeak) {
    dispatch({
      type: actionTypes.setPronunciationMessage,
      payload: ""
    });

    const result = await speakWord(textToSpeak);

    if (!result.ok) {
      dispatch({
        type: actionTypes.setPronunciationMessage,
        payload: result.reason === "inAppBrowser" ? text.pronunciationOpenInChrome : text.pronunciationUnavailable
      });
    }
  }

  function startFlashcards(mode) {
    const deck = createPracticeDeck(mode, activeProgress, vocabulary);

    dispatch({
      type: actionTypes.startFlashcards,
      payload: {
        mode,
        wordIds: deck.map((word) => word.id),
        showMeaning: settings.autoShowMeaning,
        showExample: settings.autoShowExample
      }
    });
  }

  function advanceFlashcard() {
    const flashcards = sessionRef.current.flashcards;

    if (!flashcards || flashcards.wordIds.length === 0) {
      return;
    }

    const nextIndex = flashcards.currentIndex + 1;
    const nextWordIds = nextIndex < flashcards.wordIds.length ? flashcards.wordIds : shuffle(flashcards.wordIds);

    dispatch({
      type: actionTypes.advanceFlashcard,
      payload: {
        wordIds: nextWordIds
      }
    });
  }

  return {
    dispatch,
    hasSavedSession,
    isPersistenceReady,
    pronunciationMessage,
    session,
    settings,
    progress: activeProgress,
    storageMode,
    text,
    stats,
    currentFlashcards,
    currentFlashcard,
    currentQuestion,
    timeLeftSeconds,
    starredWords,
    knownWords,
    actions: {
      goHome: () => dispatch({ type: actionTypes.goHome }),
      openScreen: (screen) => dispatch({ type: actionTypes.openScreen, payload: screen }),
      updateSetting,
      toggleSetting,
      toggleStarredWord,
      addStarredWords,
      toggleKnownWord,
      pronounce,
      startFlashcards,
      advanceFlashcard,
      startQuiz,
      handleQuizAnswer
    },
    helpers: {
      getResumeScreen: () => getResumeScreen(session)
    }
  };
}
