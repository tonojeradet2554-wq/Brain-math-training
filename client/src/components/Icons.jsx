/** Brand mark and custom game glyphs (stroke style matches lucide icons). */

export function LogoMark({ size = 28 }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <path d="M20.4 11.1a7 7 0 1 0 0 9.8" fill="none" stroke="var(--logo-fg)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="22.3" cy="16" r="2" fill="var(--logo-fg)" />
    </svg>
  );
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function SudokuGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
      <path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" strokeWidth="1.4" />
      <rect x="10.3" y="10.3" width="3.4" height="3.4" rx="0.8" fill="currentColor" stroke="none" />
      <rect x="4.9" y="15.9" width="3.4" height="3.4" rx="0.8" fill="currentColor" stroke="none" opacity="0.45" />
    </svg>
  );
}

function Make24Glyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <path d="M17 14v6M14 17h6" />
    </svg>
  );
}

function FastMathGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M7.5 4v7M4 7.5h7" />
      <path d="M13.5 17h7" />
      <path d="M18 4.5 6 19.5" strokeWidth="1.5" opacity="0.55" />
    </svg>
  );
}

const GLYPHS = { sudoku: SudokuGlyph, make24: Make24Glyph, fastmath: FastMathGlyph };

export function GameIcon({ game, size }) {
  const Glyph = GLYPHS[game] ?? SudokuGlyph;
  return (
    <span className={`game-icon tint-${game}${size ? ` ${size}` : ''}`}>
      <Glyph />
    </span>
  );
}
