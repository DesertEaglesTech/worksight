"use client";
import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { languages, type Lang, type T } from "@/lib/i18n";

export function LanguageSelect({
  lang,
  onChange,
  t,
}: {
  lang: Lang;
  onChange: (lang: Lang) => void;
  t: T;
}) {
  return (
    <label className="language-select">
      <span className="sr-only">{t("nav.language")}</span>
      <select
        value={lang}
        aria-label={t("nav.language")}
        onChange={(e) => onChange(e.target.value as Lang)}
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Tutorial({
  t,
  lang,
  onLang,
  onClose,
  canTry,
  canTrySaved,
  onDefect,
  onGood,
  onSaved,
  onCreate,
}: {
  t: T;
  lang: Lang;
  onLang: (lang: Lang) => void;
  onClose: () => void;
  canTry: boolean;
  canTrySaved: boolean;
  onDefect: () => void;
  onGood: () => void;
  onSaved: () => void;
  onCreate: () => void;
}) {
  const [step, setStep] = useState(0);
  const last = 2;
  const run = (action: () => void) => {
    onClose();
    action();
  };
  return (
    <div className="welcome-backdrop">
      <section
        className="welcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
      >
        <div className="welcome-top">
          <span className="welcome-brand">
            <span className="brand-mark" /> worksight
          </span>
          <LanguageSelect lang={lang} onChange={onLang} t={t} />
        </div>
        <p className="tour-progress">
          {t("tour.step")} {step + 1} {t("tour.of")} {last + 1}
        </p>
        {step === 0 && (
          <>
            <h1 id="welcome-title">{t("welcome.title")}</h1>
            <p>{t("welcome.body")}</p>
            <ol className="welcome-steps">
              <li>{t("guide.step1")}</li>
              <li>{t("guide.step2")}</li>
              <li>{t("guide.step3")}</li>
            </ol>
          </>
        )}
        {step === 1 && (
          <>
            <h1 id="welcome-title">{t("tour.try.title")}</h1>
            <p>{t("tour.try.body")}</p>
            <div className="tour-choices">
              <button
                className="tour-choice"
                disabled={!canTry}
                onClick={() => run(onDefect)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/examples/visa-pcb1-bent-014.jpg" alt="" />
                <span>{t("guide.tryDefect")}</span>
              </button>
              <button
                className="tour-choice"
                disabled={!canTry}
                onClick={() => run(onGood)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/examples/visa-pcb1-normal-0011.jpg" alt="" />
                <span>{t("guide.tryGood")}</span>
              </button>
            </div>
            {canTrySaved && (
              <button
                className="text-button tour-saved"
                onClick={() => run(onSaved)}
              >
                {t("guide.trySaved")}
              </button>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <h1 id="welcome-title">{t("tour.own.title")}</h1>
            <ol className="welcome-steps">
              <li>{t("tour.own.1")}</li>
              <li>
                {t("tour.own.2")}
                <ul className="tour-links">
                  <li>
                    <a
                      href="https://github.com/amazon-science/spot-diff"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("tour.own.visa")}
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.mvtec.com/company/research/datasets/mvtec-ad"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("tour.own.mvtec")}
                    </a>
                  </li>
                </ul>
              </li>
              <li>{t("tour.own.3")}</li>
              <li>{t("tour.own.4")}</li>
            </ol>
            <small>{t("tour.own.formats")}</small>
          </>
        )}
        <div className="tour-actions">
          {step > 0 ? (
            <button
              className="button secondary"
              onClick={() => setStep(step - 1)}
            >
              {t("tour.back")}
            </button>
          ) : (
            <button className="text-button" onClick={onClose}>
              {t("tour.skip")}
            </button>
          )}
          <span className="tour-spacer" />
          {step === last && (
            <button className="button secondary" onClick={() => run(onCreate)}>
              {t("tour.own.create")}
            </button>
          )}
          {step < last ? (
            <button
              className="button primary welcome-cta"
              onClick={() => setStep(step + 1)}
              autoFocus
            >
              {t("tour.next")} <ArrowRight size={18} />
            </button>
          ) : (
            <button className="button primary welcome-cta" onClick={onClose}>
              {t("welcome.guest")} <ArrowRight size={18} />
            </button>
          )}
        </div>
        <small>{t("welcome.guestNote")}</small>
      </section>
    </div>
  );
}

export function Settings({
  t,
  lang,
  onLang,
  theme,
  onTheme,
  onTutorial,
  onReset,
}: {
  t: T;
  lang: Lang;
  onLang: (lang: Lang) => void;
  theme: "light" | "dark";
  onTheme: (theme: "light" | "dark") => void;
  onTutorial: () => void;
  onReset: () => void;
}) {
  return (
    <div className="settings-grid">
      <section className="settings-card">
        <h2>{t("settings.language")}</h2>
        <LanguageSelect lang={lang} onChange={onLang} t={t} />
      </section>
      <section className="settings-card">
        <h2>{t("settings.appearance")}</h2>
        <div className="segmented">
          {(["light", "dark"] as const).map((value) => (
            <button
              key={value}
              className={theme === value ? "selected" : ""}
              aria-pressed={theme === value}
              onClick={() => onTheme(value)}
            >
              {t(value === "light" ? "settings.light" : "settings.dark")}
            </button>
          ))}
        </div>
      </section>
      <section className="settings-card">
        <h2>{t("settings.tutorial")}</h2>
        <p>{t("settings.tutorialText")}</p>
        <button className="button secondary" onClick={onTutorial}>
          {t("settings.tutorialButton")}
        </button>
      </section>
      <section className="settings-card">
        <h2>{t("settings.session")}</h2>
        <p>{t("settings.sessionText")}</p>
        <button className="text-button" onClick={onReset}>
          {t("settings.reset")}
        </button>
      </section>
    </div>
  );
}

export function QuickStart({
  t,
  disabled,
  canTrySaved,
  onDefect,
  onGood,
  onSaved,
  onHide,
}: {
  t: T;
  disabled: boolean;
  canTrySaved: boolean;
  onDefect: () => void;
  onGood: () => void;
  onSaved: () => void;
  onHide: () => void;
}) {
  return (
    <section className="quick-start" aria-label={t("guide.title")}>
      <h2>{t("guide.title")}</h2>
      <div className="quick-start-actions">
        <button
          className="button primary"
          disabled={disabled}
          onClick={onDefect}
        >
          {t("guide.tryDefect")} <ArrowRight size={16} />
        </button>
        <button
          className="button secondary"
          disabled={disabled}
          onClick={onGood}
        >
          {t("guide.tryGood")}
        </button>
        {canTrySaved && (
          <button className="text-button" disabled={disabled} onClick={onSaved}>
            {t("guide.trySaved")}
          </button>
        )}
      </div>
      <button
        className="icon-button quick-start-hide"
        aria-label={t("guide.hide")}
        title={t("guide.hide")}
        onClick={onHide}
      >
        <X size={18} />
      </button>
    </section>
  );
}
