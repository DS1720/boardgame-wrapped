import { useMemo } from 'react';
import type { Dataset, DateRange } from '@/shared/types';
import { allTimeRange, lastMonthsRange, makeRange, yearRange } from '@/ingest/select';

interface Props {
  dataset: Dataset;
  range: DateRange;
  onChange: (range: DateRange) => void;
  /** What the video should call this range. Blank means use the derived label. */
  name: string;
  onName: (value: string) => void;
  error: string | null;
  onError: (message: string | null) => void;
}

const toInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const RangePicker: React.FC<Props> = ({
  dataset,
  range,
  onChange,
  name,
  onName,
  error,
  onError,
}) => {
  const years = useMemo(() => {
    const set = new Set(dataset.plays.map((p) => p.date.getFullYear()));
    return [...set].sort((a, b) => b - a);
  }, [dataset]);

  const apply = (from: string, to: string) => {
    try {
      onChange(makeRange(new Date(from), new Date(to), `${from} → ${to}`));
      onError(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'That range is not valid.');
    }
  };

  return (
    <section className="panel">
      <h2>Time range</h2>
      <div className="chips">
        {years.map((y) => (
          <button
            key={y}
            className={range.label === String(y) ? 'chip is-active' : 'chip'}
            onClick={() => onChange(yearRange(y))}
          >
            {y}
          </button>
        ))}
        <button className="chip" onClick={() => onChange(lastMonthsRange(12))}>
          Last 12 months
        </button>
        <button className="chip" onClick={() => onChange(allTimeRange(dataset))}>
          All time
        </button>
      </div>
      <div className="row">
        <label>
          From
          <input
            type="date"
            value={toInput(range.from)}
            onChange={(e) => apply(e.target.value, toInput(range.to))}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={toInput(range.to)}
            onChange={(e) => apply(toInput(range.from), e.target.value)}
          />
        </label>
      </div>
      {/*
        Blank is not an empty title, it is "no override" — so the derived label
        goes in the placeholder rather than being typed into the field. Seeding
        the input with it would make every session look renamed, and clearing
        the box would then be the only way back to the default.
      */}
      <label className="range-name">
        Year Heading
        <input
          type="text"
          value={name}
          placeholder={range.label}
          maxLength={40}
          onChange={(e) => onName(e.target.value)}
          aria-describedby="range-name-note"
        />
      </label>
      <p className="panel-note" id="range-name-note">
        Leave empty to use “{range.label}”.
      </p>

      {error && <p className="error">{error}</p>}
    </section>
  );
};
