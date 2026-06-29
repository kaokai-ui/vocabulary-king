import StageHeader from "../shared/StageHeader";
import { QUIZ_MODES } from "../../lib/game";

export default function QuizResultScreen({
  text,
  quiz,
  vocabularyTrackLabel,
  wrongWordIds = [],
  savedWrongWordCount = 0,
  onSaveWrongWords,
  onHome,
  onRestartQuiz,
  starredWordIds = [],
  onAddWordToWordList
}) {
  if (!quiz) {
    return null;
  }

  const columns = text.reviewAnswer.split(" / ");
  const hasWrongWords = wrongWordIds.length > 0;
  const savedAllWrongWords = hasWrongWords && savedWrongWordCount >= wrongWordIds.length;
  const resultTitle =
    quiz.mode === QUIZ_MODES.meaningChoice
      ? vocabularyTrackLabel
        ? `${text.quiz} ${vocabularyTrackLabel}`
        : text.quiz
      : vocabularyTrackLabel
        ? `${text.clozePractice} ${vocabularyTrackLabel}`
        : text.clozePractice;

  return (
    <main className="stage-shell">
      <StageHeader text={text} title={resultTitle} subtitle={text.latestScore} onHome={onHome} />
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
              {quiz.answers.map((answer) => {
                const isStarred = starredWordIds.includes(answer.wordId);
                return (
                  <tr key={`${answer.questionId}-${answer.wordId}`}>
                    <td>{answer.prompt}</td>
                    <td>
                      <div className="result-answer-cell">
                        <span>{answer.correctText}</span>
                        <button
                          className={isStarred ? "add-word-button add-word-button--active" : "add-word-button"}
                          type="button"
                          disabled={isStarred}
                          onClick={() => !isStarred && onAddWordToWordList?.(answer.wordId)}
                          aria-label={isStarred ? text.wordAddedToList : text.addWordToList}
                        >
                          {isStarred ? text.wordAddedToList : text.addWordToList}
                        </button>
                      </div>
                    </td>
                    <td className={answer.isCorrect ? "answer-cell answer-cell--correct" : "answer-cell answer-cell--wrong"}>
                      {answer.selectedText ?? text.timedOut}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="results-actions">
          <button className="solid-button" type="button" onClick={() => onRestartQuiz(quiz.questionCount, quiz.mode)}>
            {text.restart}
          </button>
          {hasWrongWords ? (
            <button
              className={savedAllWrongWords ? "ghost-button ghost-button--active" : "ghost-button"}
              type="button"
              onClick={() => onSaveWrongWords?.(wrongWordIds)}
            >
              {savedAllWrongWords ? text.addedWrongWordsToWordList : text.addWrongWordsToWordList}
            </button>
          ) : null}
          <button className="ghost-button" type="button" onClick={onHome}>
            {text.home}
          </button>
        </div>
      </section>
    </main>
  );
}
