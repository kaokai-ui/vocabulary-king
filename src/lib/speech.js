export function isSpeechSynthesisSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function isLikelyInAppBrowser(userAgent = "") {
  const normalizedUserAgent = userAgent.toLowerCase();

  return (
    normalizedUserAgent.includes(" line/") ||
    normalizedUserAgent.includes("line/") ||
    normalizedUserAgent.includes("fban") ||
    normalizedUserAgent.includes("fbav") ||
    normalizedUserAgent.includes("fb_iab") ||
    normalizedUserAgent.includes("instagram")
  );
}

function pickEnglishVoice(voices) {
  return (
    voices.find((voice) => voice.lang?.toLowerCase().startsWith("en-us")) ??
    voices.find((voice) => voice.lang?.toLowerCase().startsWith("en-gb")) ??
    voices.find((voice) => voice.lang?.toLowerCase().startsWith("en")) ??
    null
  );
}

function waitForVoices(synth, timeoutMs = 1200) {
  const existingVoices = synth.getVoices();

  if (existingVoices.length > 0) {
    return Promise.resolve(existingVoices);
  }

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = null;

    function finish(voices) {
      if (settled) {
        return;
      }

      settled = true;

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      synth.onvoiceschanged = null;
      resolve(voices);
    }

    synth.onvoiceschanged = () => {
      finish(synth.getVoices());
    };

    timeoutId = window.setTimeout(() => {
      finish(synth.getVoices());
    }, timeoutMs);
  });
}

let voicesWarmupPromise = null;

export function warmSpeechVoices() {
  if (!isSpeechSynthesisSupported()) {
    return Promise.resolve([]);
  }

  if (!voicesWarmupPromise) {
    voicesWarmupPromise = waitForVoices(window.speechSynthesis).catch(() => []);
  }

  return voicesWarmupPromise;
}

export async function speakWord(text) {
  if (!text || !isSpeechSynthesisSupported()) {
    return {
      ok: false,
      reason: typeof navigator !== "undefined" && isLikelyInAppBrowser(navigator.userAgent) ? "inAppBrowser" : "unsupported"
    };
  }

  try {
    const synth = window.speechSynthesis;
    const utterance = new window.SpeechSynthesisUtterance(text);
    const voices = await warmSpeechVoices();
    const voice = pickEnglishVoice(voices);

    utterance.lang = voice?.lang ?? "en-US";
    utterance.rate = 0.92;
    utterance.pitch = 1;

    if (voice) {
      utterance.voice = voice;
    }

    synth.cancel();
    synth.speak(utterance);

    return {
      ok: true
    };
  } catch (error) {
    return {
      ok: false,
      reason: typeof navigator !== "undefined" && isLikelyInAppBrowser(navigator.userAgent) ? "inAppBrowser" : "unsupported"
    };
  }
}

export function stopSpeaking() {
  if (!isSpeechSynthesisSupported()) {
    return;
  }

  window.speechSynthesis.cancel();
}
