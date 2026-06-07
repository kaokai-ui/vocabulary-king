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

export function trackEvent(eventName, details = {}) {
  const gtag = getGtag();

  if (!gtag) {
    return;
  }

  gtag("event", eventName, details);
}

export function trackScreenView(screenConfig = DEFAULT_SCREEN, details = {}) {
  const { pagePath, pageTitle, screenName } = { ...DEFAULT_SCREEN, ...screenConfig };
  const basePath = getBasePath();
  const fullPath = `${basePath}${pagePath}`;
  const payload = {
    page_path: fullPath,
    page_title: pageTitle,
    screen_name: screenName,
    ...details
  };

  trackEvent("page_view", payload);
  trackEvent("screen_view", payload);
}
