import LocaleSwitcher from "../shared/LocaleSwitcher";

export default function HomeScreen({
  text,
  locale,
  messages,
  vocabularyTrackLabel,
  vocabularyCount,
  masteredCount,
  starredCount,
  knownCount,
  progressRate,
  hasSavedSession,
  isVocabularyLoading,
  isVocabularyReady,
  vocabularyError,
  onStartRandomFlashcards,
  onStartStarredFlashcards,
  onOpenQuizSetup,
  onOpenClozeQuizSetup,
  onOpenWordList,
  onOpenKnownWords,
  onOpenStats,
  onOpenSettings,
  onResume,
  onChangeLocale,
  onRetryVocabulary
}) {
  const heroLogoSrc = `${import.meta.env.BASE_URL}branding/logo-home.png`;
  const heroLogoWebpSrc = `${import.meta.env.BASE_URL}branding/logo-home.webp`;
  const disableVocabularyActions = !isVocabularyReady;

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <h1 className="hero-logo-title">
            <picture>
              <source srcSet={heroLogoWebpSrc} type="image/webp" />
              <img
                className="hero-logo"
                src={heroLogoSrc}
                alt={text.title}
                width="2048"
                height="486"
                fetchPriority="high"
                decoding="async"
              />
            </picture>
          </h1>
        </div>

        <div className="hero-stats">
          <div className="metric-card metric-card--track">
            <span>{text.vocabularyTrackCurrent}</span>
            <strong>{vocabularyTrackLabel}</strong>
          </div>
          <div className="metric-card">
            <span>{text.totalWords}</span>
            <strong>{vocabularyCount}</strong>
          </div>
          <div className="metric-card">
            <span>{text.masteredWords}</span>
            <strong>{masteredCount}</strong>
          </div>
          <div className="metric-card">
            <span>{text.starredWordsShort}</span>
            <strong>{starredCount}</strong>
          </div>
        </div>
      </section>

      <section className="home-grid">
        <button
          className="feature-card feature-card--flashcard"
          type="button"
          disabled={disableVocabularyActions}
          onClick={onStartRandomFlashcards}
        >
          <span className="eyebrow">{text.flashcards}</span>
          <h2>{text.flashcardsRandom}</h2>
          <p>{text.flashcardExplanation}</p>
        </button>

        <button className="feature-card feature-card--flashcard-alt" type="button" onClick={onStartStarredFlashcards}>
          <span className="eyebrow">{text.flashcards}</span>
          <h2>{text.flashcardsStarred}</h2>
          <p>{text.starPracticeHint}</p>
        </button>

        <button className="feature-card feature-card--quiz" type="button" disabled={disableVocabularyActions} onClick={onOpenQuizSetup}>
          <span className="eyebrow">{text.quiz}</span>
          <h2>{text.quiz}</h2>
          <p>{text.quizExplanation}</p>
        </button>

        <button
          className="feature-card feature-card--cloze"
          type="button"
          disabled={disableVocabularyActions}
          onClick={onOpenClozeQuizSetup}
        >
          <span className="eyebrow">{text.quiz}</span>
          <h2>{text.clozePractice}</h2>
          <p>{text.clozePracticeExplanation}</p>
        </button>

        <button className="feature-card feature-card--word-list" type="button" onClick={onOpenWordList}>
          <span className="eyebrow">{text.wordList}</span>
          <h2>{starredCount}</h2>
          <p>{text.wordListExplanation}</p>
        </button>

        <button className="feature-card feature-card--known" type="button" disabled={disableVocabularyActions} onClick={onOpenKnownWords}>
          <span className="eyebrow">{text.knownWords}</span>
          <h2>{knownCount}</h2>
          <p>{text.knownWordsExplanation}</p>
        </button>

        <button className="feature-card" type="button" disabled={disableVocabularyActions} onClick={onOpenStats}>
          <span className="eyebrow">{text.stats}</span>
          <h2>{progressRate}%</h2>
          <p>{text.statsExplanation}</p>
        </button>

        <button className="feature-card" type="button" onClick={onOpenSettings}>
          <span className="eyebrow">{text.settings}</span>
          <h2>{text.settings}</h2>
          <p>{text.settingsHint}</p>
        </button>
      </section>

      {hasSavedSession ? (
        <section className="resume-banner">
          <div>
            <strong>{text.restoreBanner}</strong>
            <p>{text.resume}</p>
          </div>
          <button className="solid-button" type="button" onClick={onResume}>
            {text.resume}
          </button>
        </section>
      ) : null}

      {isVocabularyLoading || vocabularyError ? (
        <section className="resume-banner vocabulary-status-banner">
          <div>
            <strong>{vocabularyError ? text.vocabularyLoadFailed : text.loadingVocabulary}</strong>
          </div>
          {vocabularyError ? (
            <button className="solid-button" type="button" onClick={onRetryVocabulary}>
              {text.retryVocabulary}
            </button>
          ) : null}
        </section>
      ) : null}

      <LocaleSwitcher locale={locale} messages={messages} onChange={onChangeLocale} />
    </main>
  );
}
