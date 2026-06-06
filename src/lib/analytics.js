const DEFAULT_SCREEN = {
  pagePath: "/home",
  pageTitle: "Vocabulary King - Home",
  screenName: "home"
};

function getBasePath() {
  const baseUrl = import.meta.env.BASE_URL || "/";

  if (baseUrl === "/") {
    return "";
  }

  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function getGtag() {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return null;
  }

  return window.gtag;
}

export function trackScreenView(screenConfig = DEFAULT_SCREEN, details = {}) {
  const gtag = getGtag();

  if (!gtag) {
    return;
  }

  const { pagePath, pageTitle, screenName } = { ...DEFAULT_SCREEN, ...screenConfig };
  const basePath = getBasePath();
  const fullPath = `${basePath}${pagePath}`;
  const payload = {
    page_path: fullPath,
    page_title: pageTitle,
    screen_name: screenName,
    ...details
  };

  gtag("event", "page_view", payload);
  gtag("event", "screen_view", payload);
}
