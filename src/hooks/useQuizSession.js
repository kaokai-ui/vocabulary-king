import { useEffect, useMemo, useRef } from "react";
import { createQuizQuestions, QUIZ_TIME_LIMIT_MS } from "../lib/game";
import { QUIZ_MODES } from "../lib/quiz/questionBuilders";
import { actionTypes } from "../state/actionTypes";

export function useQuizSession({
  dispatch,
  session,
  sessionRef,
  activeTrackId,
  vocabulary,
  now,
  settings
}) {
  const quizAdvanceTimeoutRef = useRef(null);

  const currentQuestion = useMemo(
    () => (session.quiz && session.quiz.questions.length > 0 ? session.quiz.questions[session.quiz.currentIndex] : null),
    [session.quiz]
  );

  const timerEnabled = session.quiz?.timerEnabled ?? true;
  const timeLeftMs =
    session.screen === "quiz" && session.quiz && timerEnabled
      ? Math.max(QUIZ_TIME_LIMIT_MS - Math.max(now - session.quiz.questionStartedAt, 0), 0)
      : null;
  const timeLeftSeconds = timeLeftMs == null ? null : Math.ceil(timeLeftMs / 1000);

  useEffect(() => {
    if (session.screen !== "quiz" || !session.quiz || !timerEnabled) {
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
  }, [dispatch, session.screen, session.quiz?.currentIndex, timerEnabled]);

  function handleQuizAnswer(selectedChoiceId) {
    const activeSession = sessionRef.current;

    if (!activeSession.quiz || activeSession.quiz.isLocked) {
      return;
    }

    const activeQuestion = activeSession.quiz.questions[activeSession.quiz.currentIndex];
    const selectedChoice = activeQuestion.choices.find((choice) => choice.id === selectedChoiceId) ?? null;
    const isCorrect = selectedChoiceId === activeQuestion.correctChoiceId;

    dispatch({
      type: actionTypes.lockQuizAnswer,
      payload: {
        activeQuestion,
        answeredAt: Date.now(),
        isCorrect,
        selectedChoiceId,
        selectedChoiceText: selectedChoice?.text ?? null
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
              accuracy,
              mode: latestQuiz.mode
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
    if (session.screen !== "quiz" || !session.quiz || !timerEnabled || session.quiz.isLocked || timeLeftMs > 0) {
      return;
    }

    handleQuizAnswer(null);
  }, [session.screen, session.quiz, timeLeftMs, timerEnabled]);

  useEffect(() => {
    return () => {
      if (quizAdvanceTimeoutRef.current) {
        window.clearTimeout(quizAdvanceTimeoutRef.current);
      }
    };
  }, []);

  function startQuiz(questionCount, mode = QUIZ_MODES.meaningChoice) {
    const isMeaningQuiz = mode === QUIZ_MODES.meaningChoice;
    const nextTimerEnabled = isMeaningQuiz ? settings.meaningQuizTimerEnabled : settings.clozeQuizTimerEnabled;

    dispatch({
      type: actionTypes.startQuiz,
      payload: {
        mode,
        timerEnabled: nextTimerEnabled,
        questionCount,
        questions: createQuizQuestions(vocabulary, questionCount, { mode }),
        startedAt: Date.now()
      }
    });
  }

  return {
    currentQuestion,
    timeLeftSeconds,
    startQuiz,
    handleQuizAnswer
  };
}
