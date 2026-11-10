import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './languages/en.json'
import es from './languages/es.json'

const resources = {
  en: { translation: en satisfies typeof es },
  es: { translation: es },
}
const languageKey = 'catalog-language'

function getInitialLanguage() {
  try {
    return localStorage.getItem(languageKey) === 'en' ? 'en' : 'es'
  } catch {
    return 'es'
  }
}

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: 'es',
    supportedLngs: ['es', 'en'],
    interpolation: { escapeValue: false },
  })

i18n.on('languageChanged', (language) => {
  try {
    localStorage.setItem(languageKey, language)
  } catch {
    // The language can still change when storage is unavailable.
  }
})

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: (typeof resources)['es']
  }
}
