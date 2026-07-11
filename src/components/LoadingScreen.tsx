/// <summary>
/// Full-screen branded gate shown while the app connects and while the first board's critical
/// assets (active map + party portraits) warm the shared image cache — so the table appears
/// complete rather than popping in. Purely presentational; the caller decides when to dismiss it
/// (with a hard time cap so it can never become a long wait). Inherits the parchment theme.
/// </summary>
export function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-screen__card">
        <div className="loading-screen__crest" aria-hidden />
        <div className="loading-screen__label">{label}</div>
        <div className="loading-screen__bar" aria-hidden>
          <span />
        </div>
      </div>
    </div>
  );
}
