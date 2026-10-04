import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Keyboard,
  Volume2,
  MonitorCog,
  RotateCcw,
  MousePointer2,
  Gauge,
} from "lucide-react";
import AmbientBackground from "@/components/AmbientBackground";

const STORAGE_KEY = "osugamesettings";

const DEFAULTS = {
  dim: 60,
  blur: 0,
  cursorsize: 1.0,
  showhwmouse: false,
  snakein: true,
  snakeout: true,
  autofullscreen: false,
  disableWheel: false,
  disableButton: false,
  K1name: "Z",
  K2name: "X",
  Kpausename: "SPACE",
  Kpause2name: "ESC",
  K1keycode: 90,
  K2keycode: 88,
  Kpausekeycode: 32,
  Kpause2keycode: 27,
  mastervolume: 60,
  effectvolume: 100,
  musicvolume: 100,
  audiooffset: 0,
  beatmapHitsound: true,
};

function loadSettings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(next) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function keyLabel(e) {
  if (e.key === " ") return "SPACE";
  if (e.key === "Escape") return "ESC";
  if (e.key === "ArrowLeft") return "LEFT";
  if (e.key === "ArrowRight") return "RIGHT";
  if (e.key === "ArrowUp") return "UP";
  if (e.key === "ArrowDown") return "DOWN";
  return (e.key || e.code || "KEY").toUpperCase();
}

function SettingCard({ title, subtitle, icon: Icon, children }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl overflow-hidden">
      <div className="flex items-center gap-3 border-b border-white/8 px-5 md:px-6 py-5">
        <div className="h-10 w-10 rounded-2xl border border-white/10 bg-white/[0.04] flex items-center justify-center">
          <Icon size={18} className="text-white/75" />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-white">{title}</h2>
          <p className="mt-0.5 text-[12px] text-white/38">{subtitle}</p>
        </div>
      </div>
      <div className="p-5 md:p-6 space-y-5">{children}</div>
    </section>
  );
}

function RangeRow({ label, hint, value, min, max, step = 1, suffix = "", onChange }) {
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium text-white/85">{label}</div>
          {hint && <div className="mt-1 text-[11px] text-white/35">{hint}</div>}
        </div>
        <div className="text-[12px] font-semibold tabular-nums text-white/65">
          {Number(value).toFixed(step < 1 ? 2 : 0)}{suffix}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-[#ff66aa]"
      />
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <div>
        <div className="text-[13px] font-medium text-white/85">{label}</div>
        {hint && <div className="mt-1 text-[11px] text-white/35">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={
          "relative h-7 w-12 rounded-full border transition-colors " +
          (checked
            ? "border-[#ff66aa]/45 bg-[#ff66aa]/20"
            : "border-white/10 bg-white/[0.04]")
        }
      >
        <span
          className={
            "absolute top-1 h-5 w-5 rounded-full bg-white transition-transform " +
            (checked ? "translate-x-[23px]" : "translate-x-1")
          }
        />
      </button>
    </label>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState(loadSettings);
  const [listening, setListening] = useState(null);
  const [keyError, setKeyError] = useState("");

  const dirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(DEFAULTS),
    [settings]
  );

  function patch(key, value) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }

  useEffect(() => {
    if (!listening) return;

    function onKeyDown(e) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setListening(null);
        setKeyError("");
        return;
      }

      const name = keyLabel(e);
      const code = e.keyCode || e.which || 0;
      const otherName = listening === "K1" ? settings.K2name : settings.K1name;

      if (name === otherName) {
        setKeyError("Cette touche est déjà utilisée par l’autre action.");
        return;
      }

      setSettings((prev) => {
        const next = {
          ...prev,
          [listening === "K1" ? "K1name" : "K2name"]: name,
          [listening === "K1" ? "K1keycode" : "K2keycode"]: code,
        };
        saveSettings(next);
        return next;
      });

      setKeyError("");
      setListening(null);
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [listening, settings.K1name, settings.K2name]);

  function resetDefaults() {
    const next = { ...DEFAULTS };
    saveSettings(next);
    setSettings(next);
    setListening(null);
    setKeyError("");
  }

  return (
    <main className="relative min-h-screen px-5 md:px-10 pt-28 pb-20">
      <AmbientBackground />

      <div className="relative mx-auto w-full max-w-[1120px]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-8"
        >
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] uppercase tracking-[0.28em] text-white/45">
              <Gauge size={12} />
              Settings
            </div>
            <h1 className="mt-4 text-[42px] md:text-[58px] leading-none tracking-tight font-semibold text-white">
              Tune your <span className="text-white/35">game.</span>
            </h1>
            <p className="mt-3 max-w-[60ch] text-[13px] md:text-[14px] text-white/45">
              Ces réglages sont sauvegardés localement et lus directement par le moteur Webosu 2.
            </p>
          </div>

          <button
            type="button"
            onClick={resetDefaults}
            disabled={!dirty}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 py-2.5 text-[10px] uppercase tracking-[0.22em] font-semibold text-white/60 hover:text-white hover:border-white/25 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <RotateCcw size={13} />
            Reset defaults
          </button>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SettingCard
            title="Controls"
            subtitle="Remappe les deux touches principales d’osu!standard."
            icon={Keyboard}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ["K1", "Left key", settings.K1name],
                ["K2", "Right key", settings.K2name],
              ].map(([id, label, value]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setKeyError("");
                    setListening(id);
                  }}
                  className={
                    "rounded-2xl border px-4 py-4 text-left transition " +
                    (listening === id
                      ? "border-[#ff66aa]/60 bg-[#ff66aa]/10 shadow-[0_0_30px_rgba(255,102,170,.08)]"
                      : "border-white/10 bg-black/20 hover:border-white/25 hover:bg-white/[0.03]")
                  }
                >
                  <div className="text-[10px] uppercase tracking-[0.23em] text-white/35">
                    {label}
                  </div>
                  <div className="mt-2 text-[18px] font-semibold text-white">
                    {listening === id ? "Listening…" : value}
                  </div>
                  <div className="mt-1 text-[10px] text-white/30">
                    {listening === id ? "Appuie sur Esc pour annuler" : "Cliquer pour remapper"}
                  </div>
                </button>
              ))}
            </div>

            {keyError && (
              <div className="rounded-xl border border-red-400/20 bg-red-500/8 px-3 py-2 text-[11px] text-red-200">
                {keyError}
              </div>
            )}

            <ToggleRow
              label="Disable mouse buttons"
              hint="Force l’utilisation du clavier uniquement."
              checked={settings.disableButton}
              onChange={(v) => patch("disableButton", v)}
            />
            <ToggleRow
              label="Disable mouse wheel"
              hint="Évite les inputs accidentels via la molette."
              checked={settings.disableWheel}
              onChange={(v) => patch("disableWheel", v)}
            />

            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-[11px] leading-relaxed text-white/35">
              Le navigateur ne donne pas accès à un véritable mode Raw Input clavier comme une application native. Le remappage ici agit directement sur les keycodes utilisés par Webosu 2.
            </div>
          </SettingCard>

          <SettingCard
            title="Audio"
            subtitle="Volumes et synchronisation du moteur de jeu."
            icon={Volume2}
          >
            <RangeRow
              label="Master volume"
              value={settings.mastervolume}
              min={0}
              max={100}
              suffix="%"
              onChange={(v) => patch("mastervolume", v)}
            />
            <RangeRow
              label="Music volume"
              value={settings.musicvolume}
              min={0}
              max={100}
              suffix="%"
              onChange={(v) => patch("musicvolume", v)}
            />
            <RangeRow
              label="Effect volume"
              value={settings.effectvolume}
              min={0}
              max={100}
              suffix="%"
              onChange={(v) => patch("effectvolume", v)}
            />
            <RangeRow
              label="Audio offset"
              hint="Décalage global appliqué au gameplay."
              value={settings.audiooffset}
              min={-200}
              max={200}
              suffix="ms"
              onChange={(v) => patch("audiooffset", v)}
            />
            <ToggleRow
              label="Beatmap hitsounds"
              checked={settings.beatmapHitsound}
              onChange={(v) => patch("beatmapHitsound", v)}
            />
          </SettingCard>

          <SettingCard
            title="Gameplay"
            subtitle="Lisibilité du beatmap pendant une partie."
            icon={MonitorCog}
          >
            <RangeRow
              label="Background dim"
              value={settings.dim}
              min={0}
              max={100}
              suffix="%"
              onChange={(v) => patch("dim", v)}
            />
            <RangeRow
              label="Background blur"
              value={settings.blur}
              min={0}
              max={100}
              suffix="%"
              onChange={(v) => patch("blur", v)}
            />
            <ToggleRow
              label="Slider snake-in"
              checked={settings.snakein}
              onChange={(v) => patch("snakein", v)}
            />
            <ToggleRow
              label="Slider snake-out"
              checked={settings.snakeout}
              onChange={(v) => patch("snakeout", v)}
            />
            <ToggleRow
              label="Auto fullscreen"
              checked={settings.autofullscreen}
              onChange={(v) => patch("autofullscreen", v)}
            />
          </SettingCard>

          <SettingCard
            title="Cursor"
            subtitle="Taille et comportement du curseur."
            icon={MousePointer2}
          >
            <RangeRow
              label="Cursor size"
              value={settings.cursorsize}
              min={0.5}
              max={2}
              step={0.05}
              suffix="x"
              onChange={(v) => patch("cursorsize", v)}
            />
            <ToggleRow
              label="Show hardware mouse"
              hint="Affiche le pointeur système en plus du curseur du jeu."
              checked={settings.showhwmouse}
              onChange={(v) => patch("showhwmouse", v)}
            />
          </SettingCard>
        </div>
      </div>
    </main>
  );
}
