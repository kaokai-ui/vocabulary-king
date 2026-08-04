export const PRONUNCIATION_ACCENTS = {
  US: "US",
  UK: "UK"
};

export function normalizePronunciationAccent(accent) {
  return accent === PRONUNCIATION_ACCENTS.UK ? PRONUNCIATION_ACCENTS.UK : PRONUNCIATION_ACCENTS.US;
}

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

function pickEnglishVoice(voices, accent) {
  const preferredLanguage = normalizePronunciationAccent(accent) === PRONUNCIATION_ACCENTS.UK ? "en-gb" : "en-us";

  return (
    voices.find((voice) => voice.lang?.toLowerCase().startsWith(preferredLanguage)) ??
    voices.find((voice) => voice.lang?.toLowerCase().startsWith("en-us")) ??
    voices.find((voice) => voice.lang?.toLowerCase().startsWith("en-gb")) ??
    voices.find((voice) => voice.lang?.toLowerCase().startsWith("en")) ??
    null
  );
}

export function isShortPronunciationText(text) {
  const normalizedText = String(text ?? "").trim();

  if (!normalizedText || normalizedText.length > 80) {
    return false;
  }

  if (/[.!?;:()[\]{}，。！？；：、（）【】]/u.test(normalizedText)) {
    return false;
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9'’/& -]*$/.test(normalizedText)) {
    return false;
  }

  return normalizedText.split(/\s+/).filter(Boolean).length <= 6;
}

export function getYoudaoAudioUrl(text, accent = PRONUNCIATION_ACCENTS.US) {
  const type = normalizePronunciationAccent(accent) === PRONUNCIATION_ACCENTS.UK ? 1 : 2;

  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(String(text).trim())}&type=${type}`;
}

let activeAudio = null;

function playYoudaoAudio(text, accent) {
  if (typeof window === "undefined" || typeof window.Audio !== "function") {
    return Promise.resolve({ ok: false, reason: "audioUnavailable" });
  }

  stopAudio();

  try {
    const audio = new window.Audio(getYoudaoAudioUrl(text, accent));
    audio.preload = "auto";
    activeAudio = audio;

    return Promise.resolve(audio.play()).then(
      () => ({ ok: true, source: "youdao" }),
      () => {
        if (activeAudio === audio) {
          activeAudio = null;
        }

        return { ok: false, reason: "audioUnavailable" };
      }
    );
  } catch (error) {
    activeAudio = null;
    return Promise.resolve({ ok: false, reason: "audioUnavailable" });
  }
}

function stopAudio() {
  if (!activeAudio) {
    return;
  }

  activeAudio.pause?.();
  activeAudio.currentTime = 0;
  activeAudio = null;
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
let voicesWarmupSynth = null;

export function warmSpeechVoices() {
  if (!isSpeechSynthesisSupported()) {
    return Promise.resolve([]);
  }

  const synth = window.speechSynthesis;

  if (!voicesWarmupPromise || voicesWarmupSynth !== synth) {
    voicesWarmupSynth = synth;
    voicesWarmupPromise = waitForVoices(synth).catch(() => []);
  }

  return voicesWarmupPromise;
}

async function speakWithBrowser(text, accent) {
  const synth = window.speechSynthesis;
  const utterance = new window.SpeechSynthesisUtterance(text);
  const voices = await warmSpeechVoices();
  const voice = pickEnglishVoice(voices, accent);

  utterance.lang = voice?.lang ?? (normalizePronunciationAccent(accent) === PRONUNCIATION_ACCENTS.UK ? "en-GB" : "en-US");
  utterance.rate = 0.92;
  utterance.pitch = 1;

  if (voice) {
    utterance.voice = voice;
  }

  synth.speak(utterance);

  return {
    ok: true,
    source: "speechSynthesis"
  };
}

export async function speakWord(text, options = {}) {
  const normalizedText = String(text ?? "").trim();

  if (!normalizedText) {
    return {
      ok: false,
      reason: "unsupported"
    };
  }

  const accent = normalizePronunciationAccent(typeof options === "string" ? options : options.accent);
  const canUseAudio = typeof window !== "undefined" && typeof window.Audio === "function";
  const canUseSpeechSynthesis = isSpeechSynthesisSupported();

  if (!canUseAudio && !canUseSpeechSynthesis) {
    return {
      ok: false,
      reason: typeof navigator !== "undefined" && isLikelyInAppBrowser(navigator.userAgent) ? "inAppBrowser" : "unsupported"
    };
  }

  try {
    stopSpeaking();

    if (isShortPronunciationText(normalizedText)) {
      const audioResult = await playYoudaoAudio(normalizedText, accent);

      if (audioResult.ok) {
        return audioResult;
      }
    }

    if (!canUseSpeechSynthesis) {
      return {
        ok: false,
        reason: typeof navigator !== "undefined" && isLikelyInAppBrowser(navigator.userAgent) ? "inAppBrowser" : "unsupported"
      };
    }

    return await speakWithBrowser(normalizedText, accent);
  } catch (error) {
    return {
      ok: false,
      reason: typeof navigator !== "undefined" && isLikelyInAppBrowser(navigator.userAgent) ? "inAppBrowser" : "unsupported"
    };
  }
}

export function stopSpeaking() {
  stopAudio();

  if (!isSpeechSynthesisSupported()) {
    return;
  }

  window.speechSynthesis.cancel();
}
