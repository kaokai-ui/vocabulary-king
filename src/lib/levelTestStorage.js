export const LEVEL_TEST_HISTORY_KEY = "vocabulary-king:level-test-history";
export const LEVEL_TEST_HISTORY_LIMIT = 20;

export function appendLevelTestHistory(history, result) {
  return [result, ...(Array.isArray(history) ? history : [])].slice(0, LEVEL_TEST_HISTORY_LIMIT);
}

export function readLevelTestHistory() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value = window.localStorage.getItem(LEVEL_TEST_HISTORY_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.slice(0, LEVEL_TEST_HISTORY_LIMIT) : [];
  } catch (error) {
    return [];
  }
}

export function saveLevelTestResult(result) {
  const history = appendLevelTestHistory(readLevelTestHistory(), result);

  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LEVEL_TEST_HISTORY_KEY, JSON.stringify(history));
    }
  } catch (error) {
    // Keep the completed result visible for this session when storage is unavailable.
  }

  return history;
}

export function clearLevelTestHistory() {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LEVEL_TEST_HISTORY_KEY);
    }
  } catch (error) {
    // The UI still clears its in-memory history if local storage is unavailable.
  }
}
