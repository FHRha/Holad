import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ruTranslation from '../public/locales/ru/translation.json';
import enTranslation from '../public/locales/en/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslation },
      ru: { translation: ruTranslation },
    },
    fallbackLng: 'ru',
    debug: false,
    interpolation: {
      escapeValue: false, // React already safe from xss
    },
  });

export default i18n;
