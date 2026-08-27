import { contrast } from '@/theme/color';
import { BODY_FONTS, DISPLAY_FONTS, fontStack, UTILITY_FONTS } from '@/theme/fonts';
import { STARTERS } from '@/theme/starters';
import { CONTRAST, type FontId, type Theme, type ThemeColor } from '@/theme/types';

/**
 * Theme picker.
 *
 * There is no preview here: the one on the right of the screen is the preview,
 * and it is already showing this theme. A second `<Player>` would render the
 * same frames twice for no gain.
 */

const COLOR_LABELS: Array<[keyof ThemeColor, string]> = [
  ['bg', 'Ground'],
  ['surface', 'Surface'],
  ['ink', 'Ink'],
  ['inkMuted', 'Muted ink'],
  ['accent', 'Accent'],
  ['accentAlt', 'Accent alt'],
];

/** Muted ink is stored with alpha, which `<input type="color">` cannot represent. */
const isEditableColor = (value: string) => value.startsWith('#');

interface Props {
  theme: Theme;
  mode: string;
  boxArtMode: boolean;
  onSelectStarter: (id: string) => void;
  onRoll: (dark?: boolean) => void;
  onSetColor: (key: keyof ThemeColor, value: string) => void;
  onSetFont: (role: 'display' | 'body' | 'utility', id: FontId) => void;
  onToggleBoxArt: (on: boolean) => void;
}

export const ThemePicker: React.FC<Props> = ({
  theme,
  mode,
  boxArtMode,
  onSelectStarter,
  onRoll,
  onSetColor,
  onSetFont,
  onToggleBoxArt,
}) => {
  const inkRatio = contrast(theme.color.ink, theme.color.bg);
  const accentRatio = contrast(theme.color.accent, theme.color.bg);

  return (
    <section className="panel">
      <h2>Theme</h2>

      <div className="theme-row">
        {STARTERS.map((starter) => (
          <button
            key={starter.id}
            className={`theme-chip${theme.id === starter.id ? ' is-active' : ''}`}
            onClick={() => onSelectStarter(starter.id)}
            style={{ background: starter.color.bg, color: starter.color.ink }}
          >
            <span className="theme-chip-name" style={{ fontFamily: fontStack(starter.type.display) }}>
              {starter.name}
            </span>
            <span className="theme-chip-swatches">
              {[starter.color.accent, starter.color.accentAlt, starter.color.surface].map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
          </button>
        ))}
      </div>

      <div className="theme-actions">
        <button onClick={() => onRoll()}>Random</button>
        <button className="link" onClick={() => onRoll(true)}>
          Random dark
        </button>
        <button className="link" onClick={() => onRoll(false)}>
          Random light
        </button>
        <label className="theme-toggle">
          <input type="checkbox" checked={boxArtMode} onChange={(e) => onToggleBoxArt(e.target.checked)} />
          Colour from box art
        </label>
      </div>

      <div className="theme-preview">
        <div className="theme-detail">
          <p className="theme-name">
            {theme.name}
            <span className="theme-mode">{boxArtMode ? 'box art' : mode}</span>
          </p>

          <dl className="theme-ratios">
            <div>
              <dt>Ink on ground</dt>
              <dd className={inkRatio >= CONTRAST.inkOnBg ? '' : 'is-low'}>{inkRatio.toFixed(1)}:1</dd>
            </div>
            <div>
              <dt>Accent on ground</dt>
              <dd className={accentRatio >= CONTRAST.accentOnBgLarge ? '' : 'is-low'}>
                {accentRatio.toFixed(1)}:1
              </dd>
            </div>
          </dl>

          <div className="theme-fonts">
            {(
              [
                ['display', DISPLAY_FONTS],
                ['body', BODY_FONTS],
                ['utility', UTILITY_FONTS],
              ] as const
            ).map(([role, options]) => (
              <label key={role}>
                <span>{role}</span>
                <select
                  value={theme.type[role]}
                  onChange={(e) => onSetFont(role, e.target.value as FontId)}
                  style={{ fontFamily: fontStack(theme.type[role]) }}
                >
                  {options.map((font) => (
                    <option key={font.id} value={font.id} style={{ fontFamily: fontStack(font.id) }}>
                      {font.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="theme-colors">
            {COLOR_LABELS.map(([key, label]) => (
              <label key={key} title={theme.color[key]}>
                <input
                  type="color"
                  value={isEditableColor(theme.color[key]) ? theme.color[key] : '#888888'}
                  onChange={(e) => onSetColor(key, e.target.value)}
                  // Muted ink is derived from ink with alpha; editing it directly
                  // would break that relationship for generated themes.
                  disabled={!isEditableColor(theme.color[key])}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
