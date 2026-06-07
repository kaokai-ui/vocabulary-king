import { useState } from "react";
import StageHeader from "../shared/StageHeader";

export default function QuizSetupScreen({ text, title, subtitle, startButtonLabel, onHome, onStartQuiz }) {
  const [selectedCount, setSelectedCount] = useState(10);

  return (
    <main className="stage-shell">
      <StageHeader text={text} title={title ?? text.quiz} subtitle={subtitle ?? text.chooseQuizCount} onHome={onHome} />
      <section className="choice-grid choice-grid--compact">
        {[10, 25, 50].map((count) => (
          <button
            key={count}
            className={selectedCount === count ? "chip chip--active quiz-count-chip" : "chip quiz-count-chip"}
            type="button"
            onClick={() => setSelectedCount(count)}
          >
            {count} {text.questionsUnit}
          </button>
        ))}
      </section>
      <section className="results-panel quiz-setup-panel">
        <p>{text.questionCountLabel}</p>
        <h2>
          {selectedCount} {text.questionsUnit}
        </h2>
        <button className="solid-button" type="button" onClick={() => onStartQuiz(selectedCount)}>
          {startButtonLabel ?? text.startQuiz}
        </button>
      </section>
    </main>
  );
}
