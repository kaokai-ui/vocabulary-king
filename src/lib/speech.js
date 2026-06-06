export function isSpeechSynthesisSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function pickEnglishVoice(voices) {
  return (
    voices.find((voice) => voice.lang?.toLowerCase().startsWith("en-us")) ??
    voices.find((voice) => voice.lang?.toLowerCase().startsWith("en-gb")) ??
    voices.find((voice) => voice.lang?.toLowerCase().startsWith("en")) ??
    null
  );
}

export function speakWord(text) {
  if (!isSpeechSynthesisSupported() || !text) {
    return false;
  }

  const synth = window.speechSynthesis;
  const utterance = new window.SpeechSynthesisUtterance(text);
  const voices = synth.getVoices();
  const voice = pickEnglishVoice(voices);

  utterance.lang = voice?.lang ?? "en-US";
  utterance.rate = 0.92;
  utterance.pitch = 1;

  if (voice) {
    utterance.voice = voice;
  }

  synth.cancel();
  synth.speak(utterance);

  return true;
}

export function stopSpeaking() {
  if (!isSpeechSynthesisSupported()) {
    return;
  }

  window.speechSynthesis.cancel();
}
