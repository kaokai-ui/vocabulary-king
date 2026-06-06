export default function LocaleSwitcher({ locale, messages, onChange }) {
  return (
    <section className="locale-switcher">
      {Object.entries(messages).map(([nextLocale, localeMessages]) => (
        <button
          key={nextLocale}
          className={nextLocale === locale ? "chip chip--active" : "chip"}
          type="button"
          onClick={() => onChange(nextLocale)}
        >
          {localeMessages.localeLabel}
        </button>
      ))}
    </section>
  );
}
