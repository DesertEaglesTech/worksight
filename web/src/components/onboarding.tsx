"use client";
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

export function Welcome({
  t,
  lang,
  onLang,
  onContinue,
}: {
  t: T;
  lang: Lang;
  onLang: (lang: Lang) => void;
  onContinue: () => void;
}) {
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
        <h1 id="welcome-title">{t("welcome.title")}</h1>
        <p>{t("welcome.body")}</p>
        <ol className="welcome-steps">
          <li>{t("guide.step1")}</li>
          <li>{t("guide.step2")}</li>
          <li>{t("guide.step3")}</li>
        </ol>
        <button
          className="button primary welcome-cta"
          onClick={onContinue}
          autoFocus
        >
          {t("welcome.guest")} <ArrowRight size={18} />
        </button>
        <small>{t("welcome.guestNote")}</small>
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
      <div className="quick-start-text">
        <h2>{t("guide.title")}</h2>
        <ol>
          <li>{t("guide.step1")}</li>
          <li>{t("guide.step2")}</li>
          <li>{t("guide.step3")}</li>
        </ol>
      </div>
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
