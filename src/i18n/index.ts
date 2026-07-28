import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import ptBR from "./pt-BR.json";
import es from "./es.json";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    "pt-BR": { translation: ptBR },
    es: { translation: es },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
    prefix: "{",
    suffix: "}",
  },
});

export default i18n;
