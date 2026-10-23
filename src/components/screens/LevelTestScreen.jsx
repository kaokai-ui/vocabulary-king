import { useEffect, useState } from "react";
import { vocabularyTracks } from "../../constants/vocabularyTracks";
import {
  answerLevelTestQuestion,
  classifyLevelTestResult,
  createLevelTestSession,
  estimateLevelTestWordCount,
  getNextLevelTestQuestion,
  LEVEL_TEST_QUESTION_COUNT,
  LEVEL_TEST_UNKNOWN_ANSWER_ID
} from "../../lib/levelTest";
import {
  clearLevelTestHistory,
  readLevelTestHistory,
  saveLevelTestResult
} from "../../lib/levelTestStorage";
import { getLevelTestRulerMarkers } from "../../lib/levelTestRuler";

function getTrackLabel(trackId, text) {
  const track = vocabularyTracks.find((item) => item.value === trackId);
  return (track && text[track.labelKey]) || trackId;
}

function HistoryList({ history, text, locale, onClear }) {
  return (
    <section className="level-test-history-panel" aria-labelledby="level-test-history-title">
      <div className="level-test-panel-heading">
        <div>
          <p className="eyebrow">{text.levelTestHistoryEyebrow}</p>
          <h2 id="level-test-history-title">{text.levelTestHistory}</h2>
        </div>
        {history.length > 0 ? (
          <button className="ghost-button" type="button" onClick={onClear}>
            {text.levelTestClearHistory}
          </button>
        ) : null}
      </div>
      {history.length === 0 ? (
        <p className="level-test-history-empty">{text.levelTestHistoryEmpty}</p>
      ) : (
        <ol className="level-test-history-list">
          {history.map((item, index) => {
            const nearestNames = (item.nearestTrackIds ?? [])
              .map((trackId) => getTrackLabel(trackId, text))
              .filter(Boolean);
            const nearestLabel = item.isBelowLowestTrack
              ? text.levelTestStartAtElementaryOrJuniorHigh
              : nearestNames.join("、") || text.levelTestNoLevelMatch;
            const completedAt = new Date(item.completedAt);

            return (
              <li key={item.completedAt + "-" + index}>
                <time dateTime={completedAt.toISOString()}>
                  {completedAt.toLocaleDateString(locale)}
                </time>
                <strong>
                  {new Intl.NumberFormat(locale).format(item.wordCount)} {text.levelTestWords}
                </strong>
                <span>{nearestLabel}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function LevelRuler({ tracks, wordCount, text }) {
  const markers = getLevelTestRulerMarkers(tracks, (trackId) => getTrackLabel(trackId, text));
  const position = Math.max(0, Math.min(100, (wordCount / 20000) * 100));

  return (
    <section className="level-test-ruler-panel" aria-labelledby="level-test-ruler-title">
      <div className="level-test-panel-heading">
        <div>
          <p className="eyebrow">{text.levelTestRulerEyebrow}</p>
          <h2 id="level-test-ruler-title">{text.levelTestRuler}</h2>
        </div>
      </div>
      <div
        className="level-test-ruler"
        role="img"
        aria-label={text.levelTestRulerDescription
          .replace("{count}", new Intl.NumberFormat(text.locale ?? "zh-TW").format(wordCount))}
      >
        <div className="level-test-ruler-track" />
        <div className="level-test-ruler-player" style={{ left: position + "%" }}>
          <span>{text.levelTestYourEstimate}</span>
        </div>
        {markers.map((marker) => (
          <div
            className="level-test-ruler-marker"
            key={marker.median}
            style={{ left: ((marker.median / 20000) * 100) + "%" }}
            data-track-ids={marker.trackIds.join(" ")}
            title={marker.names + ": " + Math.round(marker.median)}
            aria-label={marker.names + ": " + Math.round(marker.median)}
          >
            <span className="level-test-ruler-tick" />
            {marker.mobileLabel ? (
              <span
                className="level-test-ruler-label level-test-ruler-label--mobile"
                style={{ "--ruler-label-row": marker.mobileLabelRow }}
              >
                {marker.label}
              </span>
            ) : null}
            <span
              className="level-test-ruler-label level-test-ruler-label--desktop"
              style={{ "--ruler-label-row": marker.desktopLabelRow }}
            >
              {marker.label}
            </span>
          </div>
        ))}
        <span className="level-test-ruler-end level-test-ruler-end--start">0</span>
        <span className="level-test-ruler-end level-test-ruler-end--middle">10,000</span>
        <span className="level-test-ruler-end level-test-ruler-end--end">20,000</span>
      </div>
    </section>
  );
}

export default function LevelTestScreen({ text, locale, onHome, onSwitchTrack }) {
  const [bank, setBank] = useState(null);
  // A new question shows no hover highlight until the pointer moves; otherwise the answer under the
  // resting mouse looks pre-selected (user 10/24).
  const [hoverArmed, setHoverArmed] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [session, setSession] = useState(() => createLevelTestSession(Date.now()));
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState(() => readLevelTestHistory());
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    fetch(import.meta.env.BASE_URL + "data/level-test.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Level test data request failed.");
        }
        return response.json();
      })
      .then((data) => {
        if (!active) {
          return;
        }
        const nextSession = createLevelTestSession(Date.now());
        setBank(Array.isArray(data.questions) ? data.questions : []);
        setTracks(Array.isArray(data.tracks) ? data.tracks : []);
        setSession(nextSession);
        setCurrentQuestion(getNextLevelTestQuestion(data.questions ?? [], nextSession));
        setLoadError(false);
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          setLoadError(true);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [retryCount]);

  function handleAnswer(selectedChoiceId) {
    if (!currentQuestion || result) {
      return;
    }

    const nextSession = answerLevelTestQuestion(session, currentQuestion, selectedChoiceId);
    setSession(nextSession);
    setHoverArmed(false);

    if (nextSession.answers.length >= LEVEL_TEST_QUESTION_COUNT) {
      const wordCount = estimateLevelTestWordCount(nextSession.answers);
      const placement = classifyLevelTestResult(wordCount, tracks);
      const completedAt = new Date().toISOString();
      const historyEntry = {
        completedAt,
        wordCount,
        nearestTrackIds: placement.nearestTracks.map((track) => track.id),
        isBelowLowestTrack: placement.isBelowLowestTrack
      };

      setHistory(saveLevelTestResult(historyEntry));
      setResult({ ...placement, wordCount, completedAt });
      setCurrentQuestion(null);
      return;
    }

    setCurrentQuestion(getNextLevelTestQuestion(bank, nextSession));
  }

  function handleRetake() {
    const nextSession = createLevelTestSession(Date.now());
    setSession(nextSession);
    setResult(null);
    setCurrentQuestion(getNextLevelTestQuestion(bank, nextSession));
  }

  function handleClearHistory() {
    clearLevelTestHistory();
    setHistory([]);
  }

  const formattedWordCount = result
    ? new Intl.NumberFormat(locale).format(result.wordCount)
    : "";

  return (
    <main className="stage-shell level-test-shell">
      <header className="stage-header level-test-header">
        <div className="stage-copy">
          <p className="eyebrow">{text.levelTestEyebrow}</p>
          <h1>{result ? text.levelTestResultTitle : text.levelTestTitle}</h1>
          <p>{result ? text.levelTestResultSubtitle : text.levelTestPrompt}</p>
        </div>
        <button className="ghost-button" type="button" onClick={onHome}>
          {text.levelTestBackHome}
        </button>
      </header>

      {loadError ? (
        <section className="level-test-status-panel" role="alert">
          <p>{text.levelTestLoadFailed}</p>
          <button className="solid-button" type="button" onClick={() => setRetryCount((count) => count + 1)}>
            {text.levelTestRetry}
          </button>
        </section>
      ) : !bank ? (
        <section className="level-test-status-panel" aria-live="polite">
          <p>{text.levelTestLoading}</p>
        </section>
      ) : result ? (
        <>
          <section className="level-test-result-panel" aria-live="polite">
            <p className="eyebrow">{text.levelTestResultEyebrow}</p>
            <p className="level-test-result-number">
              <strong>{formattedWordCount}</strong>
              <span>{text.levelTestWords}</span>
            </p>
            <div className="level-test-result-placement">
              {result.nearestTracks.length > 0 ? (
                <>
                  <span>{text.levelTestNear}</span>
                  <strong>
                    {result.nearestTracks.map((track) => getTrackLabel(track.id, text)).join("、")}
                  </strong>
                </>
              ) : (
                <strong>{text.levelTestStartAtElementaryOrJuniorHigh}</strong>
              )}
            </div>
            {result.nextTracks.length > 0 ? (
              <div className="level-test-next">
                <p>{text.levelTestNext}</p>
                <div className="level-test-track-buttons">
                  {result.nextTracks.map((track) => (
                    <button
                      className="solid-button"
                      key={track.id}
                      type="button"
                      onClick={() => onSwitchTrack(track.id)}
                    >
                      {getTrackLabel(track.id, text)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="level-test-highest-note">{text.levelTestHighestNote}</p>
            )}
            <p className="level-test-method-note">{text.levelTestMethodNote}</p>
          </section>

          <LevelRuler tracks={tracks} wordCount={result.wordCount} text={{ ...text, locale }} />

          <section className="level-test-actions">
            <button className="solid-button" type="button" onClick={handleRetake}>
              {text.levelTestRetake}
            </button>
          </section>

          <HistoryList
            history={history}
            text={text}
            locale={locale}
            onClear={handleClearHistory}
          />
        </>
      ) : currentQuestion ? (
        // Keyed per question so the answer buttons are new elements each time: no hover or focus
        // carried over from the previous tap.
        <section
          className={"level-test-question-panel" + (hoverArmed ? "" : " is-hover-paused")}
          aria-live="polite"
          key={currentQuestion.id}
          onMouseMove={hoverArmed ? undefined : () => setHoverArmed(true)}
        >
          <div className="level-test-progress-row">
            <span>
              {text.levelTestQuestionProgress
                .replace("{current}", String(session.answers.length + 1))
                .replace("{total}", String(LEVEL_TEST_QUESTION_COUNT))}
            </span>
            <progress
              max={LEVEL_TEST_QUESTION_COUNT}
              value={session.answers.length + 1}
              aria-label={text.levelTestQuestionProgress
                .replace("{current}", String(session.answers.length + 1))
                .replace("{total}", String(LEVEL_TEST_QUESTION_COUNT))}
            />
          </div>
          <p className="eyebrow">{text.levelTestChooseMeaning}</p>
          <h2 className="level-test-word">{currentQuestion.word.word}</h2>
          {currentQuestion.word.pos ? (
            <span className="level-test-pos">{currentQuestion.word.pos}</span>
          ) : null}
          <div className="level-test-choices">
            {currentQuestion.choices.map((choice) => (
              <button
                className="level-test-choice"
                key={choice.id}
                type="button"
                onClick={() => handleAnswer(choice.id)}
              >
                {choice.text}
              </button>
            ))}
          </div>
          <button
            className="level-test-unknown"
            type="button"
            onClick={() => handleAnswer(LEVEL_TEST_UNKNOWN_ANSWER_ID)}
          >
            {text.levelTestDontKnow}
          </button>
        </section>
      ) : (
        <section className="level-test-status-panel" role="alert">
          <p>{text.levelTestNotEnoughQuestions}</p>
        </section>
      )}
    </main>
  );
}
