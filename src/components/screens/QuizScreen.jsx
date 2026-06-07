import SpeakerButton from "../shared/SpeakerButton";

export default function QuizScreen({
  text,
  question,
  currentIndex,
  totalQuestions,
  correctCount,
  wrongCount,
  timeLeftSeconds,
  selectedChoiceId,
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
          <h1>{question.prompt}</h1>
          {question.promptVoice ? <SpeakerButton onClick={() => onPronounce(question.promptVoice)} /> : null}
        </div>
        <p>{text.tapCorrectAnswer}</p>
        {pronunciationMessage ? <p className="flashcard-example">{pronunciationMessage}</p> : null}

        <div className="quiz-options">
          {question.choices.map((choice, optionIndex) => {
            const isSelected = selectedChoiceId === choice.id;
            const isCorrect = choice.id === question.correctChoiceId;
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
                key={`${question.wordId}-${choice.id}`}
                className={className}
                type="button"
                disabled={isLocked}
                onClick={() => onAnswer(choice.id)}
              >
                <span>{String.fromCharCode(65 + optionIndex)}</span>
                <strong>{choice.text}</strong>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
