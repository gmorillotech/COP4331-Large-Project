import type { ChangeEvent } from 'react';

type TrustScoreControlProps = {
  value: number;
  onChange: (value: number) => void;
};

function getScoreColor(value: number): string {
  // Gradient from red (0) through yellow (5) to green (10)
  const ratio = value / 10;
  if (ratio <= 0.5) {
    // Red to yellow
    const r = 220;
    const g = Math.round(180 * (ratio * 2));
    return `rgb(${r}, ${g}, 0)`;
  }
  // Yellow to green
  const r = Math.round(220 * (1 - (ratio - 0.5) * 2));
  const g = 180;
  return `rgb(${r}, ${g}, 0)`;
}

const SLIDER_GRADIENT = (() => {
  const stops: string[] = [];
  for (let i = 0; i <= 10; i++) {
    stops.push(`${getScoreColor(i)} ${i * 10}%`);
  }
  return `linear-gradient(to right, ${stops.join(', ')})`;
})();

function TrustScoreControl({ value, onChange }: TrustScoreControlProps) {
  function handleSliderChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(parseFloat(e.target.value));
  }

  function handleNumberChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = parseFloat(e.target.value);
    if (isNaN(raw)) return;
    const clamped = Math.min(10, Math.max(0, Math.round(raw * 10) / 10));
    onChange(clamped);
  }

  const color = getScoreColor(value);

  return (
    <div className="trust-score-control">
      <div className="trust-score-inputs">
        <input
          type="range"
          className="trust-score-slider"
          min="0"
          max="10"
          step="0.1"
          value={value}
          onChange={handleSliderChange}
          style={{ background: SLIDER_GRADIENT }}
        />
        <input
          type="number"
          className="trust-score-number"
          min="0"
          max="10"
          step="0.1"
          value={value}
          onChange={handleNumberChange}
        />
      </div>
      <span
        className="trust-score-value-display"
        style={{ backgroundColor: color + '22', color }}
      >
        {value.toFixed(1)}
      </span>
    </div>
  );
}

export default TrustScoreControl;
