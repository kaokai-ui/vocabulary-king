import StageHeader from "../shared/StageHeader";

export default function QuizResultScreen({ text, quiz, onHome, onRestartQuiz }) {
  if (!quiz) {
    return null;
  }

  const columns = text.reviewAnswer.split(" / ");

  return (
    <main className="stage-shell">
      <StageHeader text={text} title={text.quiz} subtitle={text.latestScore} onHome={onHome} />
      <section className="results-panel">
        <div className="metric-row">
          <div className="metric-card">
            <span>{text.accuracy}</span>
            <strong>{quiz.accuracy}%</strong>
          </div>
          <div className="metric-card">
            <span>{text.correct}</span>
            <strong>{quiz.correctCount}</strong>
          </div>
          <div className="metric-card">
            <span>{text.wrong}</span>
            <strong>{quiz.wrongCount}</strong>
          </div>
        </div>

        <div className="result-table-wrapper">
          <table className="result-table">
            <thead>
              <tr>
                <th>{columns[0] ?? "Word"}</th>
                <th>{columns[1] ?? "Correct answer"}</th>
                <th>{columns[2] ?? "Your answer"}</th>
              </tr>
            </thead>
            <tbody>
              {quiz.answers.map((answer) => (
                <tr key={`${answer.questionId}-${answer.wordId}`}>
                  <td>{answer.prompt}</td>
                  <td>{answer.correctText}</td>
                  <td className={answer.isCorrect ? "answer-cell answer-cell--correct" : "answer-cell answer-cell--wrong"}>
                    {answer.selectedText ?? text.timedOut}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="results-actions">
          <button className="solid-button" type="button" onClick={() => onRestartQuiz(quiz.questionCount, quiz.mode)}>
            {text.restart}
          </button>
          <button className="ghost-button" type="button" onClick={onHome}>
            {text.home}
          </button>
        </div>
      </section>
    </main>
  );
}
