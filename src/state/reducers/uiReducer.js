import { actionTypes } from "../actionTypes";

export function uiReducer(state, action) {
  switch (action.type) {
    case actionTypes.hydratePersistence:
      return state;

    case actionTypes.setNow:
      return {
        ...state,
        now: action.payload
      };

    case actionTypes.setPronunciationMessage:
      return {
        ...state,
        pronunciationMessage: action.payload
      };

    case actionTypes.goHome:
    case actionTypes.openScreen:
    case actionTypes.startFlashcards:
    case actionTypes.advanceFlashcard:
    case actionTypes.startQuiz:
    case actionTypes.advanceQuiz:
    case actionTypes.completeQuiz:
      return {
        ...state,
        pronunciationMessage: ""
      };

    default:
      return state;
  }
}
