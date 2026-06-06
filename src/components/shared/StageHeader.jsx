export default function StageHeader({ text, title, subtitle, onHome }) {
  return (
    <header className="stage-header">
      <button className="ghost-button" type="button" onClick={onHome}>
        {text.home}
      </button>
      <div className="stage-copy">
        <p className="eyebrow">{text.title}</p>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </header>
  );
}
