import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { messages } from "../i18n/messages";
import { countProgress, createPracticeDeck, getResumeScreen } from "../lib/appState";
import { loadPersistedAppState, savePersistedAppState } from "../lib/persistence";
import { getTrackProgress, isTrackProgressEqual, migrateTrackProgress } from "../lib/progress";
import { createQuizQuestions, isMasteredWord, QUIZ_TIME_LIMIT_MS, shuffle } from "../lib/game";
import { speakWord, stopSpeaking } from "../lib/speech";
import { STORAGE_KEYS, writeStoredValue } from "../lib/storage";
import { actionTypes } from "../state/actionTypes";
import { appReducer, createInitialAppState } from "../state/appReducer";

export function useVocabularyApp(vocabulary) {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialAppState);
  const [isPersistenceReady, setIsPersistenceReady] = useState(false);
  const [storageMode, setStorageMode] = useState("localstorage");
  const sessionRef = useRef(state.session);
  const flashcardSeenRef = useRef(null);
  const quizAdvanceTimeoutRef = useRef(null);

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

  const currentQuestion =
    session.quiz && session.quiz.questions.length > 0
      ? session.quiz.questions[session.quiz.currentIndex]
      : null;

  const stats = useMemo(() => countProgress(activeProgress, vocabulary, isMasteredWord), [activeProgress, vocabulary]);

  const timeLeftMs =
    session.screen === "quiz" && session.quiz
      ? Math.max(QUIZ_TIME_LIMIT_MS - Math.max(now - session.quiz.questionStartedAt, 0), 0)
      : QUIZ_TIME_LIMIT_MS;
  const timeLeftSeconds = Math.ceil(timeLeftMs / 1000);
  const hasSavedSession = session.screen === "home" && Boolean(session.flashcards || session.quiz);
  const starredWords = activeProgress.starredWordIds.map((wordId) => vocabularyById[wordId]).filter(Boolean);
  const knownWords = (activeProgress.knownWordIds ?? []).map((wordId) => vocabularyById[wordId]).filter(Boolean);

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
    if (session.screen !== "quiz" || !session.quiz) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      dispatch({
        type: actionTypes.setNow,
        payload: Date.now()
      });
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [session.screen, session.quiz?.currentIndex]);

  function handleQuizAnswer(selectedIndex) {
    const activeSession = sessionRef.current;

    if (!activeSession.quiz || activeSession.quiz.isLocked) {
      return;
    }

    const activeQuestion = activeSession.quiz.questions[activeSession.quiz.currentIndex];
    const isCorrect = selectedIndex === activeQuestion.correctIndex;

    dispatch({
      type: actionTypes.lockQuizAnswer,
      payload: {
        activeQuestion,
        answeredAt: Date.now(),
        isCorrect,
        selectedIndex
      },
      meta: {
        trackId: activeTrackId
      }
    });

    if (quizAdvanceTimeoutRef.current) {
      window.clearTimeout(quizAdvanceTimeoutRef.current);
    }

    quizAdvanceTimeoutRef.current = window.setTimeout(() => {
      const latestSession = sessionRef.current;

      if (!latestSession.quiz) {
        return;
      }

      const latestQuiz = latestSession.quiz;
      const nextIndex = latestQuiz.currentIndex + 1;

      if (nextIndex >= latestQuiz.questions.length) {
        const accuracy =
          latestQuiz.questionCount === 0 ? 0 : Math.round((latestQuiz.correctCount / latestQuiz.questionCount) * 100);

        dispatch({
          type: actionTypes.completeQuiz,
          payload: {
            accuracy,
            historyEntry: {
              trackId: activeTrackId,
              playedAt: Date.now(),
              questionCount: latestQuiz.questionCount,
              correctCount: latestQuiz.correctCount,
              wrongCount: latestQuiz.wrongCount,
              accuracy
            }
          },
          meta: {
            trackId: activeTrackId
          }
        });
        return;
      }

      dispatch({
        type: actionTypes.advanceQuiz,
        payload: {
          startedAt: Date.now()
        }
      });
    }, 700);
  }

  useEffect(() => {
    if (session.screen !== "quiz" || !session.quiz || session.quiz.isLocked || timeLeftMs > 0) {
      return;
    }

    handleQuizAnswer(null);
  }, [session.screen, session.quiz, timeLeftMs]);

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

      if (quizAdvanceTimeoutRef.current) {
        window.clearTimeout(quizAdvanceTimeoutRef.current);
      }
    };
  }, []);

  function updateSetting(key, value) {
    dispatch({
      type: actionTypes.updateSetting,
      payload: { key, value }
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

  function toggleKnownWord(wordId) {
    dispatch({
      type: actionTypes.toggleKnownWord,
      payload: wordId,
      meta: {
        trackId: activeTrackId
      }
    });
  }

  function pronounce(textToSpeak) {
    dispatch({
      type: actionTypes.setPronunciationMessage,
      payload: ""
    });

    if (!speakWord(textToSpeak)) {
      dispatch({
        type: actionTypes.setPronunciationMessage,
        payload: text.pronunciationUnavailable
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

  function startQuiz(questionCount) {
    dispatch({
      type: actionTypes.startQuiz,
      payload: {
        questionCount,
        questions: createQuizQuestions(vocabulary, questionCount),
        startedAt: Date.now()
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
