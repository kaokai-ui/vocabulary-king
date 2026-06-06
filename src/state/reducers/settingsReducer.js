import { actionTypes } from "../actionTypes";

export function settingsReducer(state, action) {
  switch (action.type) {
    case actionTypes.updateSetting:
      return {
        ...state,
        [action.payload.key]: action.payload.value
      };

    case actionTypes.toggleSetting:
      return {
        ...state,
        [action.payload]: !state[action.payload]
      };

    default:
      return state;
  }
}
