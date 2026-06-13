import { useEffect, useMemo, useReducer, useRef } from "react";
import { normalizeVocabularyTrack } from "../constants/vocabularyTracks";
import { messages } from "../i18n/messages";
import { countProgress, createPracticeDeck, getResumeScreen } from "../lib/appState";
import { trackEvent } from "../lib/analytics";
import { isMasteredWord, shuffle } from "../lib/game";
import { actionTypes } from "../state/actionTypes";
import { appReducer, createInitialAppState } from "../state/appReducer";
import { useFlashcardSeenTracking } from "./useFlashcardSeenTracking";
import { usePersistedAppState } from "./usePersistedAppState";
import { usePronunciation } from "./usePronunciation";
import { useQuizSession } from "./useQuizSession";
import { useSavedWords } from "./useSavedWords";
import { useTrackProgressSync } from "./useTrackProgressSync";

export function useVocabularyApp(vocabulary) {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialAppState);
  const sessionRef = useRef(state.session);

  const { settings, progress, session, now, pronunciationMessage } = state;
  const activeTrackId = settings.vocabularyTrack;
  const text = messages[settings.locale] ?? messages.en;

  const { isPersistenceReady, storageMode } = usePersistedAppState({ dispatch, settings, progress, session });

  const { activeProgress } = useTrackProgressSync({ dispatch, isPersistenceReady, progress, vocabulary, activeTrackId });

  const vocabularyById = useMemo(
    () => Object.fromEntries(vocabulary.map((word) => [word.id, word])),
    [vocabulary]
  );

  const { savedWords, savedWordById } = useSavedWords({
    dispatch,
    isPersistenceReady,
    progress,
    vocabulary,
    vocabularyById,
    activeTrackId,
    activeProgress
  });

  const flashcardWordById = useMemo(
    () => ({
      ...savedWordById,
      ...vocabularyById
    }),
    [savedWordById, vocabularyById]
  );

  const currentFlashcards = useMemo(
    () => session.flashcards?.wordIds?.map((wordId) => flashcardWordById[wordId]).filter(Boolean) ?? [],
    [session.flashcards?.wordIds, flashcardWordById]
  );

  const currentFlashcard =
    session.flashcards && currentFlashcards.length > 0
      ? currentFlashcards[session.flashcards.currentIndex % currentFlashcards.length]
      : null;

  useFlashcardSeenTracking({ dispatch, activeTrackId, session, currentFlashcard });

  const { pronounce } = usePronunciation({ dispatch });

  const stats = useMemo(() => countProgress(activeProgress, vocabulary, isMasteredWord), [activeProgress, vocabulary]);
  const hasSavedSession = session.screen === "home" && Boolean(session.flashcards || session.quiz);
  const starredWords = savedWords;
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

  function toggleStarredWord(wordOrId, trackIdOverride = activeTrackId) {
    dispatch({
      type: actionTypes.toggleStarredWord,
      payload:
        typeof wordOrId === "string"
          ? wordOrId
          : {
              ...wordOrId,
              sourceTrackId: wordOrId?.sourceTrackId ?? trackIdOverride
            },
      meta: {
        trackId: trackIdOverride
      }
    });
  }

  function addStarredWords(wordsOrIds, trackIdOverride = activeTrackId) {
    dispatch({
      type: actionTypes.addStarredWords,
      payload: (Array.isArray(wordsOrIds) ? wordsOrIds : [])
        .map((wordOrId) => (typeof wordOrId === "string" ? vocabularyById[wordOrId] : wordOrId))
        .filter(Boolean)
        .map((word) => ({
          ...word,
          sourceTrackId: word.sourceTrackId ?? trackIdOverride
        })),
      meta: {
        trackId: trackIdOverride
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

  function startFlashcards(mode) {
    const deck = mode === "starred" ? savedWords : createPracticeDeck(mode, activeProgress, vocabulary);

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
      pronounce: (textToSpeak) => pronounce(textToSpeak, text),
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
