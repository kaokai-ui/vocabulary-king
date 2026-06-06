import FlashcardScreen from "../components/screens/FlashcardScreen";
import HomeScreen from "../components/screens/HomeScreen";
import KnownWordListScreen from "../components/screens/KnownWordListScreen";
import QuizResultScreen from "../components/screens/QuizResultScreen";
import QuizScreen from "../components/screens/QuizScreen";
import QuizSetupScreen from "../components/screens/QuizSetupScreen";
import SettingsScreen from "../components/screens/SettingsScreen";
import StatsScreen from "../components/screens/StatsScreen";
import WordListScreen from "../components/screens/WordListScreen";
import { actionTypes } from "../state/actionTypes";

export const screenRegistry = {
  flashcards: (context) => (
    <FlashcardScreen
      text={context.text}
      flashcard={context.currentFlashcard}
      mode={context.session.flashcards?.mode}
      currentIndex={context.session.flashcards?.currentIndex ?? 0}
      totalCount={context.currentFlashcards.length}
      isStarred={Boolean(context.currentFlashcard && context.progress.starredWordIds.includes(context.currentFlashcard.id))}
      isKnown={Boolean(context.currentFlashcard && (context.progress.knownWordIds ?? []).includes(context.currentFlashcard.id))}
      showMeaning={Boolean(context.session.flashcards?.showMeaning)}
      showExample={Boolean(context.session.flashcards?.showExample)}
      pronunciationMessage={context.pronunciationMessage}
      onHome={context.actions.goHome}
      onPronounce={context.actions.pronounce}
      onToggleMeaning={() => context.dispatch({ type: actionTypes.toggleFlashcardPanel, payload: "showMeaning" })}
      onToggleExample={() => context.dispatch({ type: actionTypes.toggleFlashcardPanel, payload: "showExample" })}
      onToggleStarred={() => context.currentFlashcard && context.actions.toggleStarredWord(context.currentFlashcard.id)}
      onToggleKnown={() => context.currentFlashcard && context.actions.toggleKnownWord(context.currentFlashcard.id)}
      onNext={context.actions.advanceFlashcard}
    />
  ),
  quizSetup: (context) => <QuizSetupScreen text={context.text} onHome={context.actions.goHome} onStartQuiz={context.actions.startQuiz} />,
  quiz: (context) => (
    <QuizScreen
      text={context.text}
      question={context.currentQuestion}
      currentIndex={context.session.quiz?.currentIndex ?? 0}
      totalQuestions={context.session.quiz?.questions.length ?? 0}
      correctCount={context.session.quiz?.correctCount ?? 0}
      wrongCount={context.session.quiz?.wrongCount ?? 0}
      timeLeftSeconds={context.timeLeftSeconds}
      selectedIndex={context.session.quiz?.selectedIndex ?? null}
      isLocked={Boolean(context.session.quiz?.isLocked)}
      pronunciationMessage={context.pronunciationMessage}
      onAnswer={context.actions.handleQuizAnswer}
      onPronounce={context.actions.pronounce}
    />
  ),
  quizResult: (context) => (
    <QuizResultScreen
      text={context.text}
      quiz={context.session.quiz}
      onHome={context.actions.goHome}
      onRestartQuiz={context.actions.startQuiz}
    />
  ),
  wordList: (context) => (
    <WordListScreen
      text={context.text}
      words={context.starredWords}
      onHome={context.actions.goHome}
      onPronounce={context.actions.pronounce}
      onRemoveWord={context.actions.toggleStarredWord}
    />
  ),
  knownWords: (context) => (
    <KnownWordListScreen
      text={context.text}
      words={context.knownWords}
      onHome={context.actions.goHome}
      onPronounce={context.actions.pronounce}
      onRemoveWord={context.actions.toggleKnownWord}
    />
  ),
  stats: (context) => (
    <StatsScreen
      text={context.text}
      stats={context.stats}
      quizHistory={context.progress.quizHistory}
      locale={context.settings.locale}
      onHome={context.actions.goHome}
    />
  ),
  settings: (context) => (
    <SettingsScreen
      text={context.text}
      locale={context.settings.locale}
      messages={context.messages}
      settings={context.settings}
      onHome={context.actions.goHome}
      onChangeLocale={(locale) => context.actions.updateSetting("locale", locale)}
      onChangeVocabularyTrack={(track) => context.actions.updateSetting("vocabularyTrack", track)}
      onToggleSetting={context.actions.toggleSetting}
    />
  ),
  home: (context) => (
    <HomeScreen
      text={context.text}
      locale={context.settings.locale}
      messages={context.messages}
      vocabularyCount={context.vocabulary.length}
      masteredCount={context.stats.masteredCount}
      starredCount={context.progress.starredWordIds.length}
      knownCount={(context.progress.knownWordIds ?? []).length}
      progressRate={context.stats.progressRate}
      hasSavedSession={context.hasSavedSession}
      onStartRandomFlashcards={() => context.actions.startFlashcards("random")}
      onStartStarredFlashcards={() => context.actions.startFlashcards("starred")}
      onOpenQuizSetup={() => context.actions.openScreen("quizSetup")}
      onOpenWordList={() => context.actions.openScreen("wordList")}
      onOpenKnownWords={() => context.actions.openScreen("knownWords")}
      onOpenStats={() => context.actions.openScreen("stats")}
      onOpenSettings={() => context.actions.openScreen("settings")}
      onResume={() => context.actions.openScreen(context.helpers.getResumeScreen())}
      onChangeLocale={(locale) => context.actions.updateSetting("locale", locale)}
    />
  )
};
