# i18n

i18next + react-i18next. Initialised once by `./i18n.ts`, imported at every
entry point (`src/index.tsx`, `sdk/index.tsx`, `src/testing/vitest.setup.ts`).

## Files

- `locales/<lng>/<namespace>.json` — one file per namespace per language.
  `resources.ts` glob-loads them; nothing to register.
- **Add a namespace**: create `locales/en/<namespace>.json`. Done.
- **Add a language**: create `locales/<lng>/` and copy the JSON files you
  translate. Missing files or keys fall back to English. The switcher
  (`LanguageSwitcher.tsx`, on the profile settings page) lists folders
  automatically. The choice persists in `localStorage["lightdash.language"]`.

## Rules

- English strings live **only** in `locales/en/*.json`. No inline fallbacks
  (`t('key', 'Default')`), no English literals in JSX for user-visible copy.
- One namespace per feature area, named after the feature (`auth`, `navigation`,
  `dashboards`, ...). `common` holds shared verbs/states only.
- Keys: nested camelCase, grouped by screen/component, named by meaning not
  by English text: `login.forgotPassword`, `browse.allCharts`. Keep the
  English file's key order sensible; other languages mirror it.
- `data-tour-*` attributes and test ids stay English; they are not copy.
- Embeds keep their existing `uiOverrides` / `DEFAULT_UI_STRINGS` mechanism
  in `@lightdash/common`; this module does not replace it.

## Usage

```tsx
const { t } = useTranslation('auth');            // namespace once per component
t('login.title')                                  // "Log in"
t('otp.sendFailed', { email })                    // "{{email}}" interpolation
t('actions.save', { ns: 'common' })               // cross-namespace one-off
t('charts.count', { count })                      // plurals: keys `charts.count_one` / `charts.count_other`
<Trans t={t} i18nKey="otp.sentTo" values={{ email }}
       components={{ email: <Text span fw={500} /> }} />   // rich text: "...to <email>{{email}}</email>."
```

Outside components (hooks' error mappers, utils, toasts built in callbacks):

```ts
import i18n from '../i18n/i18n';
i18n.t('login.failedToLogin', { ns: 'auth' });
```

Prefer `useTranslation` in components so the UI re-renders on language change;
`i18n.t` is for code with no React scope.

## Key typing

Keys are intentionally untyped (`t(string)`). Namespaces are glob-loaded, so
typed keys would need a hand-maintained barrel of JSON imports in
`i18next.d.ts` — a shared file every feature agent would have to edit, which
defeats the no-registration design and is the usual cause of multi-second
typecheck regressions with large resource trees. Vitest renders English, so a
wrong key shows up as the raw key in any component test.

## Dates

Relative and formatted dates go through `dateLocale.ts`: pass
`{ locale: getDateFnsLocale() }` to date-fns calls and
`dayjs(x).locale(getDayjsLocale())` for dayjs. Never set the global dayjs
locale; filter week-start logic reads it. Adding a language means adding its
date-fns and dayjs locale to the two maps there.
