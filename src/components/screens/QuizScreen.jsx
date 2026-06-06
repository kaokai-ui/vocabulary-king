import SpeakerButton from "../shared/SpeakerButton";

export default function QuizScreen({
  text,
  question,
  currentIndex,
  totalQuestions,
  correctCount,
  wrongCount,
  timeLeftSeconds,
  selectedIndex,
  isLocked,
  pronunciationMessage,
  onAnswer,
  onPronounce
}) {
  if (!question) {
    return null;
  }

  return (
    <main className="game-shell">
      <header className="game-topbar">
        <div className="scoreboard">
          <span>{text.correct}: {correctCount}</span>
          <span>{text.wrong}: {wrongCount}</span>
          <span>{text.timer}: {timeLeftSeconds}</span>
        </div>
      </header>

      <section className="quiz-stage">
        <div className="quiz-heading">
          <span className="pill">{question.level}</span>
          <strong>
            {currentIndex + 1} / {totalQuestions}
          </strong>
        </div>
        <div className="word-heading word-heading--center">
          <h1>{question.word}</h1>
          <SpeakerButton onClick={() => onPronounce(question.word)} />
        </div>
        <p>{text.tapCorrectAnswer}</p>
        {pronunciationMessage ? <p className="flashcard-example">{pronunciationMessage}</p> : null}

        <div className="quiz-options">
          {question.options.map((option, optionIndex) => {
            const isSelected = selectedIndex === optionIndex;
            const isCorrect = optionIndex === question.correctIndex;
            const className = [
              "quiz-option",
              isSelected ? "quiz-option--selected" : "",
              isLocked && isCorrect ? "quiz-option--correct" : "",
              isLocked && isSelected && !isCorrect ? "quiz-option--wrong" : ""
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={`${question.wordId}-${option}`}
                className={className}
                type="button"
                disabled={isLocked}
                onClick={() => onAnswer(optionIndex)}
              >
                <span>{String.fromCharCode(65 + optionIndex)}</span>
                <strong>{option}</strong>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
