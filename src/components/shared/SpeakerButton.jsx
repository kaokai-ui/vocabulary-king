export default function SpeakerButton({ onClick, className = "" }) {
  const buttonClassName = className ? `speaker-button ${className}` : "speaker-button";

  return (
    <button className={buttonClassName} type="button" aria-label="Play pronunciation" onClick={onClick}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" focusable="false">
        <path
          d="M3 9v6h4l5 4V5L7 9H3zm12.5 3a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 15.5 12zm0-9.5v2.06a8 8 0 0 1 0 14.88v2.06a10 10 0 0 0 0-19z"
          fill="currentColor"
        />
      </svg>
    </button>
  );
}
