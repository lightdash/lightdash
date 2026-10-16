import 'dayjs/locale/es';
import { enUS, es, type Locale } from 'date-fns/locale';
import i18n from './i18n';

// Per-language date locales. Adding a language: add one entry to each map.
const dateFnsLocales: Record<string, Locale> = { en: enUS, es };
const dayjsLocales: Record<string, string> = { en: 'en', es: 'es' };

const baseLanguage = (lng: string | undefined) => (lng ?? 'en').split('-')[0];

export const getDateFnsLocale = (lng = i18n.language): Locale =>
    dateFnsLocales[baseLanguage(lng)] ?? enUS;

// Instance-level only: the global dayjs locale drives week-start logic in filters.
export const getDayjsLocale = (lng = i18n.language): string =>
    dayjsLocales[baseLanguage(lng)] ?? 'en';
