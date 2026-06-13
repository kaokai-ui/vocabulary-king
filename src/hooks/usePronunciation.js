import { useEffect } from "react";
import { speakWord, stopSpeaking } from "../lib/speech";
import { actionTypes } from "../state/actionTypes";

export function usePronunciation({ dispatch }) {
  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  async function pronounce(textToSpeak, text) {
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

  return { pronounce };
}
