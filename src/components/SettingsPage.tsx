import { Dropdown } from "./Dropdown";
import { AppearancePicker } from "./Appearance";
import { Icon } from "./Icon";
import {
  BUNDLED_FAMILY,
  DEFAULT_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  type Appearance,
  type FontChoice,
  type Settings,
} from "../settings";
import type { Theme } from "../theme";

/** Every size the base text setting accepts, newest first. */
const SIZES = Array.from(
  { length: MAX_FONT_SIZE - MIN_FONT_SIZE + 1 },
  (_, i) => MAX_FONT_SIZE - i,
);

/** Full-screen settings. Each setting is its own box under a section title. */
export function SettingsPage({
  settings,
  fonts,
  theme,
  onFont,
  onFontSize,
  onAppearance,
}: {
  settings: Settings;
  fonts: readonly FontChoice[];
  theme: Theme;
  onFont: (font: FontChoice) => void;
  onFontSize: (size: number) => void;
  onAppearance: (appearance: Appearance) => void;
}) {
  const typographyDefault =
    settings.font === BUNDLED_FAMILY && settings.fontSize === DEFAULT_FONT_SIZE;

  return (
    <main className="settings">
      <h1 className="settings-title" style={{ color: theme.text }}>
        Appearance
      </h1>

      <section className="group">
        <h2 style={{ color: theme.muted }}>Color scheme</h2>
        <AppearancePicker value={settings.appearance} onChange={onAppearance} theme={theme} />
      </section>

      <Group title="Typography" theme={theme}>
        <Row
          label="Interface font"
          hint="The face used across the app"
          theme={theme}
          control={
            <>
              <Dropdown
                className="dropdown-wide"
                value={settings.font}
                options={fonts}
                theme={theme}
                onChange={onFont}
                render={(font) => font}
                searchPlaceholder="Search fonts"
              />
              <Dropdown
                className="dropdown-narrow"
                value={settings.fontSize}
                options={SIZES}
                theme={theme}
                onChange={onFontSize}
                render={(size) => `${size}px`}
              />
            </>
          }
          action={
            <button
              type="button"
              onClick={() => {
                onFont(BUNDLED_FAMILY);
                onFontSize(DEFAULT_FONT_SIZE);
              }}
              disabled={typographyDefault}
              title="Reset typography"
              aria-label="Reset typography"
              style={{ color: theme.muted }}
            >
              <Icon name="reset" size={16} color={theme.muted} />
            </button>
          }
        />
      </Group>
    </main>
  );
}

function Group({
  title,
  theme,
  children,
}: {
  title: string;
  theme: Theme;
  children: React.ReactNode;
}) {
  return (
    <section className="group">
      <h2 style={{ color: theme.muted }}>{title}</h2>
      <div className="box">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  theme,
  control,
  action,
}: {
  label: string;
  hint: string;
  theme: Theme;
  control: React.ReactNode;
  /** the optional reset, tucked beside the label */
  action?: React.ReactNode;
}) {
  return (
    <div className="row">
      <div className="row-label">
        <span className="row-title" style={{ color: theme.text }}>
          {label}
          {action}
        </span>
        <span className="row-hint" style={{ color: theme.faint }}>
          {hint}
        </span>
      </div>
      <div className="row-control">{control}</div>
    </div>
  );
}
