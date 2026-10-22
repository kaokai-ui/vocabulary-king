export const EXTRA_LOCALE_CODES = ["ja", "ko"];

export function parseEnabledExtraLocales(value = "") {
  const requested = new Set(
    String(value ?? "")
      .split(/[\s,]+/u)
      .map((locale) => locale.trim().toLowerCase())
      .filter(Boolean)
  );

  return EXTRA_LOCALE_CODES.filter((locale) => requested.has(locale));
}

export function getEnabledExtraLocales(value = import.meta.env?.VITE_VOCAB_EXTRA_LOCALES) {
  return parseEnabledExtraLocales(value);
}

export function isExtraLocaleEnabled(locale, enabledExtraLocales = getEnabledExtraLocales()) {
  return EXTRA_LOCALE_CODES.includes(locale) && enabledExtraLocales.includes(locale);
}

export function normalizeLocale(locale, enabledExtraLocales = getEnabledExtraLocales()) {
  const candidate = String(locale ?? "");

  if (candidate === "zh-TW" || candidate === "en" || isExtraLocaleEnabled(candidate, enabledExtraLocales)) {
    return candidate;
  }

  return "zh-TW";
}
