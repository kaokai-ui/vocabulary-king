import { enMessages } from "./locales/en";
import { zhTWMessages } from "./locales/zh-TW";
import { jaMessages } from "./locales/ja";
import { koMessages } from "./locales/ko";
import { getEnabledExtraLocales } from "./localeConfig";

const extraLocaleMessages = {
  ja: jaMessages,
  ko: koMessages
};

export function createMessages(enabledExtraLocales = getEnabledExtraLocales()) {
  const visibleExtraMessages = enabledExtraLocales
    .map((locale) => [locale, extraLocaleMessages[locale]])
    .filter(([, localeMessages]) => localeMessages);

  return {
    "zh-TW": zhTWMessages,
    en: enMessages,
    ...Object.fromEntries(visibleExtraMessages)
  };
}

export const messages = createMessages();
