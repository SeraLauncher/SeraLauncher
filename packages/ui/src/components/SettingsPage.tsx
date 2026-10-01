import { useMemo, useState } from "react";
import { Dropdown } from "./Dropdown";
import { AppearancePicker } from "./Appearance";
import { Icon } from "./Icon";
import type { SettingsTab } from "./PageHeader";
import {
  BUNDLED_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_JVM_ARGS,
  DEFAULT_MAX_MEMORY,
  DEFAULT_MIN_MEMORY,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  type Appearance,
  type FontChoice,
  type JavaRuntime,
  type Settings,
} from "../settings";
import type { Theme } from "../theme";

/** Every size the base text setting accepts, newest first. */
const SIZES = Array.from(
  { length: MAX_FONT_SIZE - MIN_FONT_SIZE + 1 },
  (_, i) => MAX_FONT_SIZE - i,
);

const MEMORY_PRESETS = [
  { label: "2 GB", value: 2048 },
  { label: "4 GB", value: 4096 },
  { label: "6 GB", value: 6144 },
  { label: "8 GB", value: 8192 },
  { label: "12 GB", value: 12288 },
];

/** Full-screen settings organized by category tabs. */
export function SettingsPage({
  activeTab = "appearance",
  settings,
  fonts,
  theme,
  javaRuntimes = [],
  systemMemoryMb = 8192,
  onFont,
  onFontSize,
  onAppearance,
  onJavaPath,
  onMemory,
  onJvmArgs,
  onRefreshJava,
}: {
  activeTab?: SettingsTab;
  settings: Settings;
  fonts: readonly FontChoice[];
  theme: Theme;
  javaRuntimes?: readonly JavaRuntime[];
  systemMemoryMb?: number;
  onFont: (font: FontChoice) => void;
  onFontSize: (size: number) => void;
  onAppearance: (appearance: Appearance) => void;
  onJavaPath?: (javaPath: string | null) => void;
  onMemory?: (minMemory: number, maxMemory: number) => void;
  onJvmArgs?: (jvmArgs: string) => void;
  onRefreshJava?: () => void;
}) {
  const [customPathMode, setCustomPathMode] = useState(
    () => Boolean(settings.javaPath) && !javaRuntimes.some((r) => r.path === settings.javaPath),
  );

  const typographyDefault =
    settings.font === BUNDLED_FAMILY && settings.fontSize === DEFAULT_FONT_SIZE;
  const memoryDefault =
    settings.minMemory === DEFAULT_MIN_MEMORY && settings.maxMemory === DEFAULT_MAX_MEMORY;
  const jvmDefault = settings.jvmArgs.trim() === DEFAULT_JVM_ARGS;

  // Dropdown options for Java runtimes
  const javaOptions = useMemo(() => {
    const list = ["AUTO"];
    for (const rt of javaRuntimes) {
      list.push(rt.path);
    }
    list.push("CUSTOM");
    return list;
  }, [javaRuntimes]);

  const selectedJavaOption = useMemo(() => {
    if (customPathMode) return "CUSTOM";
    if (!settings.javaPath) return "AUTO";
    if (javaRuntimes.some((r) => r.path === settings.javaPath)) {
      return settings.javaPath;
    }
    return "CUSTOM";
  }, [customPathMode, settings.javaPath, javaRuntimes]);

  const maxSliderLimit = useMemo(() => {
    const hostGb = Math.round(systemMemoryMb / 1024);
    return Math.max(16384, hostGb * 1024);
  }, [systemMemoryMb]);

  if (activeTab === "java") {
    return (
      <main className="settings">
        <h1 className="settings-title" style={{ color: theme.text }}>
          Java &amp; Runtime
        </h1>

        <Group title="Runtime Configuration" theme={theme}>
          {/* Java Executable */}
          <Row
            label="Java Executable"
            hint={
              settings.javaPath
                ? `Selected: ${settings.javaPath}`
                : javaRuntimes.length > 0
                  ? `Auto-detected: Java ${javaRuntimes[0].majorVersion} (${javaRuntimes[0].version})`
                  : "No installed Java detected on standard paths"
            }
            theme={theme}
            action={
              onRefreshJava ? (
                <button
                  type="button"
                  onClick={onRefreshJava}
                  title="Rescan system for installed Java runtimes"
                  aria-label="Rescan system for installed Java runtimes"
                  style={{ color: theme.muted }}
                >
                  <Icon name="refresh" size={16} color={theme.muted} />
                </button>
              ) : undefined
            }
            control={
              <div className="settings-java-control">
                <Dropdown
                  className="dropdown-wide"
                  value={selectedJavaOption}
                  options={javaOptions}
                  theme={theme}
                  onChange={(option) => {
                    if (option === "AUTO") {
                      setCustomPathMode(false);
                      onJavaPath?.(null);
                    } else if (option === "CUSTOM") {
                      setCustomPathMode(true);
                    } else {
                      setCustomPathMode(false);
                      onJavaPath?.(option);
                    }
                  }}
                  render={(option) => {
                    if (option === "AUTO") {
                      const top = javaRuntimes[0];
                      return top
                        ? `Auto-detect (Java ${top.majorVersion})`
                        : "Auto-detect (None found)";
                    }
                    if (option === "CUSTOM") {
                      return "Custom path...";
                    }
                    const match = javaRuntimes.find((r) => r.path === option);
                    if (match) {
                      return `Java ${match.majorVersion} (${match.is64Bit ? "64-bit" : "32-bit"}) · ${match.version}`;
                    }
                    return option;
                  }}
                />
              </div>
            }
          />

          {/* Custom Java Path Input */}
          {customPathMode && (
            <div className="settings-custom-path-row">
              <input
                type="text"
                className="settings-input"
                style={{
                  background: theme.raised,
                  color: theme.text,
                  border: 0,
                }}
                value={settings.javaPath || ""}
                placeholder="e.g. /usr/lib/jvm/java-21-openjdk/bin/java or C:\Program Files\Java\...\javaw.exe"
                onChange={(e) => onJavaPath?.(e.target.value.trim() ? e.target.value : null)}
              />
            </div>
          )}

          {/* Memory Allocation */}
          <Row
            label="Memory Allocation"
            hint={`Minimum (-Xms) and Maximum (-Xmx) heap size. Host: ~${(systemMemoryMb / 1024).toFixed(1)} GB RAM`}
            theme={theme}
            action={
              <button
                type="button"
                onClick={() => onMemory?.(DEFAULT_MIN_MEMORY, DEFAULT_MAX_MEMORY)}
                disabled={memoryDefault}
                title="Reset memory allocation"
                aria-label="Reset memory allocation"
                style={{ color: theme.muted }}
              >
                <Icon name="reset" size={16} color={theme.muted} />
              </button>
            }
            control={
              <div className="settings-memory-panel">
                {/* Preset buttons */}
                <div className="settings-chips">
                  {MEMORY_PRESETS.map((p) => {
                    const isActive = settings.maxMemory === p.value;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        className={`settings-chip ${isActive ? "active" : ""}`}
                        style={{
                          background: isActive ? theme.accent : theme.raised,
                          color: isActive ? theme.shell : theme.text,
                        }}
                        onClick={() => {
                          const newMax = p.value;
                          const newMin = Math.min(settings.minMemory, newMax);
                          onMemory?.(newMin, newMax);
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                {/* Max RAM slider */}
                <div className="settings-slider-wrapper">
                  <div className="settings-slider-label">
                    <span style={{ color: theme.muted }}>Maximum RAM:</span>
                    <strong style={{ color: theme.text }}>
                      {(settings.maxMemory / 1024).toFixed(1)} GB ({settings.maxMemory} MB)
                    </strong>
                  </div>
                  <input
                    type="range"
                    className="settings-slider"
                    min={1024}
                    max={maxSliderLimit}
                    step={512}
                    value={settings.maxMemory}
                    onChange={(e) => {
                      const newMax = Number(e.target.value);
                      const newMin = Math.min(settings.minMemory, newMax);
                      onMemory?.(newMin, newMax);
                    }}
                  />
                </div>

                {/* Min RAM slider */}
                <div className="settings-slider-wrapper">
                  <div className="settings-slider-label">
                    <span style={{ color: theme.muted }}>Minimum RAM:</span>
                    <strong style={{ color: theme.text }}>
                      {(settings.minMemory / 1024).toFixed(1)} GB ({settings.minMemory} MB)
                    </strong>
                  </div>
                  <input
                    type="range"
                    className="settings-slider"
                    min={512}
                    max={settings.maxMemory}
                    step={256}
                    value={settings.minMemory}
                    onChange={(e) => {
                      const newMin = Number(e.target.value);
                      onMemory?.(newMin, settings.maxMemory);
                    }}
                  />
                </div>
              </div>
            }
          />

          {/* JVM Arguments */}
          <Row
            label="JVM Arguments"
            hint="Arguments appended to the java command line"
            theme={theme}
            action={
              <button
                type="button"
                onClick={() => onJvmArgs?.(DEFAULT_JVM_ARGS)}
                disabled={jvmDefault}
                title="Reset JVM arguments"
                aria-label="Reset JVM arguments"
                style={{ color: theme.muted }}
              >
                <Icon name="reset" size={16} color={theme.muted} />
              </button>
            }
            control={
              <div className="settings-jvm-control">
                <input
                  type="text"
                  className="settings-input settings-mono"
                  style={{
                    background: theme.raised,
                    color: theme.text,
                    border: 0,
                  }}
                  value={settings.jvmArgs}
                  placeholder="-XX:+UseG1GC"
                  onChange={(e) => onJvmArgs?.(e.target.value)}
                />
              </div>
            }
          />
        </Group>

        {/* Minecraft Java Compatibility Matrix Card */}
        <section className="group">
          <div className="settings-compat-card" style={{ background: theme.panel }}>
            <div className="settings-compat-header">
              <h3 style={{ color: theme.text }}>Minecraft Java Compatibility</h3>
              <span
                className="settings-badge"
                style={{ background: theme.raised, color: theme.accent }}
              >
                Phase 4 Auto-Downloader
              </span>
            </div>

            <div className="settings-compat-grid">
              <div className="settings-compat-item">
                <span className="compat-ver" style={{ color: theme.muted }}>
                  1.20.5 – 1.21+
                </span>
                <strong style={{ color: theme.text }}>Java 21 (LTS)</strong>
              </div>
              <div className="settings-compat-item">
                <span className="compat-ver" style={{ color: theme.muted }}>
                  1.18 – 1.20.4
                </span>
                <strong style={{ color: theme.text }}>Java 17 (LTS)</strong>
              </div>
              <div className="settings-compat-item">
                <span className="compat-ver" style={{ color: theme.muted }}>
                  1.17 – 1.17.1
                </span>
                <strong style={{ color: theme.text }}>Java 16 / 17</strong>
              </div>
              <div className="settings-compat-item">
                <span className="compat-ver" style={{ color: theme.muted }}>
                  1.16.5 &amp; older
                </span>
                <strong style={{ color: theme.text }}>Java 8 (64-bit)</strong>
              </div>
            </div>

            <p className="settings-compat-note" style={{ color: theme.faint }}>
              In Phase 4, SeraLauncher will automatically detect instance version requirements and
              download any missing Java runtimes (via Adoptium Eclipse Temurin API) directly during
              instance creation.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="settings">
      <h1 className="settings-title" style={{ color: theme.text }}>
        Appearance
      </h1>

      {/* Appearance Section */}
      <section className="group">
        <h2 style={{ color: theme.muted }}>Color scheme</h2>
        <AppearancePicker value={settings.appearance} onChange={onAppearance} theme={theme} />
      </section>

      {/* Typography Section */}
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
