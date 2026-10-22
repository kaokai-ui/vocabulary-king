export default function TranslationFallbackLabel({ isFallback, text }) {
  return isFallback ? <small className="translation-fallback">{text.translationFallback}</small> : null;
}
