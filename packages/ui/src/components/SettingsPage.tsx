import { EffectiveJavaArgsModal } from "./EffectiveJavaArgsModal";
import { useMemo, useState } from "react";
import { Dropdown } from "./Dropdown";
import { AppearancePicker } from "./Appearance";
import { Icon } from "./Icon";
import type { SettingsTab } from "./PageHeader";
import {
  BUNDLED_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_GC_PRESET,
  DEFAULT_JAVA_OPTIMIZE,
  DEFAULT_JVM_ARGS,
  DEFAULT_MAX_MEMORY,
  DEFAULT_MIN_MEMORY,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  type Appearance,
  type FontChoice,
  type GcPreset,
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
  onGcPreset,
  onJavaOptimize,
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
  onGcPreset?: (gcPreset: GcPreset) => void;
  onJavaOptimize?: (javaOptimize: boolean) => void;
  onJvmArgs?: (jvmArgs: string) => void;
  onRefreshJava?: () => void;
}) {
  const [customPathMode, setCustomPathMode] = useState(
    () => Boolean(settings.javaPath) && !javaRuntimes.some((r) => r.path === settings.javaPath),
  );
  const [showArgsModal, setShowArgsModal] = useState(false);

  const typographyDefault =
    settings.font === BUNDLED_FAMILY && settings.fontSize === DEFAULT_FONT_SIZE;
  const memoryDefault =
    settings.minMemory === DEFAULT_MIN_MEMORY && settings.maxMemory === DEFAULT_MAX_MEMORY;
  const gcDefault = (settings.gcPreset || DEFAULT_GC_PRESET) === DEFAULT_GC_PRESET;
  const optimizeDefault = settings.javaOptimize === DEFAULT_JAVA_OPTIMIZE;
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

  const maxRamMin = 1024;
  const maxRamRange = Math.max(1, maxSliderLimit - maxRamMin);
  const maxRamPercent = Math.min(
    100,
    Math.max(0, ((settings.maxMemory - maxRamMin) / maxRamRange) * 100),
  );

  const minRamMin = 512;
  const minRamRange = Math.max(1, settings.maxMemory - minRamMin);
  const minRamPercent = Math.min(
    100,
    Math.max(0, ((settings.minMemory - minRamMin) / minRamRange) * 100),
  );

  if (activeTab === "java") {
    return (
      <main className="settings">
        <h1 className="settings-title" style={{ color: theme.foreground }}>
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
                  style={{ color: theme.mutedForeground }}
                >
                  <Icon name="refresh" size={16} color={theme.mutedForeground} />
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
                  background: theme.secondary,
                  color: theme.foreground,
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
                style={{ color: theme.mutedForeground }}
              >
                <Icon name="reset" size={16} color={theme.mutedForeground} />
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
                          background: isActive ? theme.primary : theme.secondary,
                          color: isActive ? theme.primaryForeground : theme.foreground,
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
                    <span style={{ color: theme.mutedForeground }}>Maximum RAM:</span>
                    <strong style={{ color: theme.foreground }}>
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
                    style={{
                      background: `linear-gradient(to right, ${theme.primary} 0%, ${theme.primary} ${maxRamPercent}%, ${theme.secondary} ${maxRamPercent}%, ${theme.secondary} 100%)`,
                    }}
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
                    <span style={{ color: theme.mutedForeground }}>Minimum RAM:</span>
                    <strong style={{ color: theme.foreground }}>
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
                    style={{
                      background: `linear-gradient(to right, ${theme.primary} 0%, ${theme.primary} ${minRamPercent}%, ${theme.secondary} ${minRamPercent}%, ${theme.secondary} 100%)`,
                    }}
                    onChange={(e) => {
                      const newMin = Number(e.target.value);
                      onMemory?.(newMin, settings.maxMemory);
                    }}
                  />
                </div>
              </div>
            }
          />

          {/* Garbage Collector Preset */}
          <Row
            label="Garbage Collector"
            hint="Reclamation algorithm: G1GC is recommended; ZGC minimizes pauses on 12+ GB"
            theme={theme}
            action={
              <button
                type="button"
                onClick={() => onGcPreset?.(DEFAULT_GC_PRESET)}
                disabled={gcDefault}
                title="Reset garbage collector to G1GC"
                aria-label="Reset garbage collector to G1GC"
                style={{ color: theme.mutedForeground }}
              >
                <Icon name="reset" size={16} color={theme.mutedForeground} />
              </button>
            }
            control={
              <div className="settings-chips">
                {[
                  { label: "None", value: "none" as const },
                  { label: "G1GC", value: "g1gc" as const },
                  { label: "ZGC", value: "zgc" as const },
                ].map((gc) => {
                  const isActive = (settings.gcPreset || DEFAULT_GC_PRESET) === gc.value;
                  return (
                    <button
                      key={gc.value}
                      type="button"
                      className={`settings-chip ${isActive ? "active" : ""}`}
                      style={{
                        background: isActive ? theme.primary : theme.secondary,
                        color: isActive ? theme.primaryForeground : theme.foreground,
                      }}
                      onClick={() => onGcPreset?.(gc.value)}
                    >
                      {gc.label}
                    </button>
                  );
                })}
              </div>
            }
          />

          {/* Java Optimize Defaults */}
          <Row
            label="Use Mojang Optimize Defaults"
            hint="Applies official JVM optimization arguments recommended by Mojang"
            theme={theme}
            action={
              <button
                type="button"
                onClick={() => onJavaOptimize?.(DEFAULT_JAVA_OPTIMIZE)}
                disabled={optimizeDefault}
                title="Reset Mojang optimize defaults"
                aria-label="Reset Mojang optimize defaults"
                style={{ color: theme.mutedForeground }}
              >
                <Icon name="reset" size={16} color={theme.mutedForeground} />
              </button>
            }
            control={
              <button
                type="button"
                role="switch"
                aria-checked={settings.javaOptimize}
                aria-label="Toggle Mojang optimize defaults"
                className={`settings-switch ${settings.javaOptimize ? "active" : ""}`}
                style={{
                  background: settings.javaOptimize ? theme.primary : theme.secondary,
                }}
                onClick={() => onJavaOptimize?.(!settings.javaOptimize)}
              >
                <span
                  className="settings-switch-knob"
                  style={{
                    background: settings.javaOptimize ? theme.card : theme.mutedForeground,
                    transform: settings.javaOptimize ? "translateX(22px)" : "translateX(2px)",
                  }}
                />
              </button>
            }
          />

          {/* Custom Java Arguments */}
          <div className="settings-block-row">
            <div className="settings-block-header">
              <div className="row-label">
                <span className="row-title" style={{ color: theme.foreground }}>
                  Custom Java Arguments
                  <span className="row-actions">
                    <button
                      type="button"
                      onClick={() => onJvmArgs?.(DEFAULT_JVM_ARGS)}
                      disabled={jvmDefault}
                      title="Clear custom Java arguments"
                      aria-label="Clear custom Java arguments"
                      style={{ color: theme.mutedForeground }}
                    >
                      <Icon name="reset" size={16} color={theme.mutedForeground} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowArgsModal(true)}
                      title="View effective Java arguments"
                      aria-label="View effective Java arguments"
                      style={{ color: theme.mutedForeground }}
                    >
                      <Icon name="eye" size={16} color={theme.mutedForeground} />
                    </button>
                  </span>
                </span>
                <span className="row-hint" style={{ color: theme.mutedForeground }}>
                  Additional custom arguments appended to the launch command
                </span>
              </div>
            </div>
            <textarea
              className="settings-textarea settings-mono"
              rows={3}
              style={{
                background: theme.secondary,
                color: theme.foreground,
                border: 0,
              }}
              value={settings.jvmArgs}
              placeholder="e.g. -Dsun.rmi.dgc.server.gcInterval=2147483646 -XX:+UseStringDeduplication"
              onChange={(e) => onJvmArgs?.(e.target.value)}
            />
          </div>
        </Group>

        <EffectiveJavaArgsModal
          isOpen={showArgsModal}
          onClose={() => setShowArgsModal(false)}
          settings={settings}
          theme={theme}
        />
      </main>
    );
  }

  return (
    <main className="settings">
      <h1 className="settings-title" style={{ color: theme.foreground }}>
        Appearance
      </h1>

      {/* Appearance Section */}
      <section className="group">
        <h2 style={{ color: theme.mutedForeground }}>Color scheme</h2>
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
              style={{ color: theme.mutedForeground }}
            >
              <Icon name="reset" size={16} color={theme.mutedForeground} />
            </button>
          }
        />
      </Group>
      <EffectiveJavaArgsModal
        isOpen={showArgsModal}
        onClose={() => setShowArgsModal(false)}
        settings={settings}
        theme={theme}
      />
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
      <h2 style={{ color: theme.mutedForeground }}>{title}</h2>
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
        <span className="row-title" style={{ color: theme.foreground }}>
          {label}
          {action}
        </span>
        <span className="row-hint" style={{ color: theme.mutedForeground }}>
          {hint}
        </span>
      </div>
      <div className="row-control">{control}</div>
    </div>
  );
}
