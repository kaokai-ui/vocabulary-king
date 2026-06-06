import { actionTypes } from "../actionTypes";
import { shuffle } from "../../lib/game";

export function sessionReducer(state, action) {
  switch (action.type) {
    case actionTypes.hydratePersistence:
      return {
        ...state,
        ...action.payload.session
      };

    case actionTypes.goHome:
      return {
        ...state,
        screen: "home"
      };

    case actionTypes.openScreen:
      return {
        ...state,
        screen: action.payload
      };

    case actionTypes.startFlashcards:
      return {
        ...state,
        screen: "flashcards",
        flashcards: {
          mode: action.payload.mode,
          wordIds: action.payload.wordIds,
          currentIndex: 0,
          showMeaning: action.payload.showMeaning,
          showExample: action.payload.showExample
        },
        quiz: null
      };

    case actionTypes.advanceFlashcard: {
      const flashcards = state.flashcards;

      if (!flashcards || flashcards.wordIds.length === 0) {
        return state;
      }

      const nextIndex = flashcards.currentIndex + 1;
      const nextWordIds =
        nextIndex < flashcards.wordIds.length ? flashcards.wordIds : action.payload?.wordIds ?? shuffle(flashcards.wordIds);

      return {
        ...state,
        flashcards: {
          ...flashcards,
          wordIds: nextWordIds,
          currentIndex: nextIndex < flashcards.wordIds.length ? nextIndex : 0
        }
      };
    }

    case actionTypes.toggleFlashcardPanel: {
      const flashcards = state.flashcards;

      if (!flashcards) {
        return state;
      }

      return {
        ...state,
        flashcards: {
          ...flashcards,
          [action.payload]: !flashcards[action.payload]
        }
      };
    }

    case actionTypes.startQuiz:
      return {
        ...state,
        screen: "quiz",
        flashcards: null,
        quiz: {
          questionCount: action.payload.questionCount,
          currentIndex: 0,
          correctCount: 0,
          wrongCount: 0,
          selectedIndex: null,
          isLocked: false,
          questionStartedAt: action.payload.startedAt,
          answers: [],
          questions: action.payload.questions
        }
      };

    case actionTypes.lockQuizAnswer: {
      const quiz = state.quiz;

      if (!quiz || quiz.isLocked) {
        return state;
      }

      const { activeQuestion, isCorrect, selectedIndex } = action.payload;

      return {
        ...state,
        quiz: {
          ...quiz,
          selectedIndex,
          isLocked: true,
          correctCount: quiz.correctCount + (isCorrect ? 1 : 0),
          wrongCount: quiz.wrongCount + (isCorrect ? 0 : 1),
          answers: [
            ...quiz.answers,
            {
              wordId: activeQuestion.wordId,
              word: activeQuestion.word,
              correctMeaning: activeQuestion.correctMeaning,
              selectedMeaning: selectedIndex == null ? null : activeQuestion.options[selectedIndex],
              isCorrect
            }
          ]
        }
      };
    }

    case actionTypes.advanceQuiz: {
      const quiz = state.quiz;

      if (!quiz) {
        return state;
      }

      return {
        ...state,
        quiz: {
          ...quiz,
          currentIndex: quiz.currentIndex + 1,
          selectedIndex: null,
          isLocked: false,
          questionStartedAt: action.payload.startedAt
        }
      };
    }

    case actionTypes.completeQuiz: {
      const quiz = state.quiz;

      if (!quiz) {
        return state;
      }

      return {
        ...state,
        screen: "quizResult",
        quiz: {
          ...quiz,
          accuracy: action.payload.accuracy
        }
      };
    }

    default:
      return state;
  }
}
