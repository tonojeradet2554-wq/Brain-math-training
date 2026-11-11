import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LANGUAGE,
  createFormatters,
  errorMessage,
  hasKey,
  isLanguage,
  make24FeedbackMessage,
  translate,
} from './translate.js';

const STORAGE_KEY = 'cortex:lang';
const I18nContext = createContext(null);

function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_LANGUAGE;
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLanguage);

  const setLang = useCallback((next) => {
    if (!isLanguage(next)) return;
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = translate(lang, 'app.documentTitle');
  }, [lang]);

  const value = useMemo(() => {
    const t = (key, params) => translate(lang, key, params);
    t.has = (key) => hasKey(lang, key);
    return {
      lang,
      setLang,
      t,
      fmt: createFormatters(lang),
      errorText: (err) => errorMessage(lang, err),
      make24Feedback: (feedback) => make24FeedbackMessage(lang, feedback),
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
