# Filters — UI strings & embedded translation

Lightdash has **no i18n framework**, deliberately. The only translation
surface is embedded (SDK) UI chrome: SDK consumers pass `uiOverrides` (a flat
key→string map) and every wired string renders `override ?? English default`.
The registry `DEFAULT_UI_STRINGS` in
`packages/common/src/utils/i18n/uiStrings.ts` is the single source of truth —
`UiStringKey` and `SdkUiOverrides` are derived from it, so keys, types, and
defaults cannot drift.

## Mandate for new or changed strings in filter code

1. **Classify reachability first.** Embeds render dashboards in view mode.
   Any string a viewer can see — pills, the filter popover, value inputs,
   tooltips, placeholders, aria-labels, the required-filters guided flow —
   MUST resolve through the registry. Edit-mode-only UI (`isEditMode`-gated
   builders, visibility toggles, the filter-label input) stays a plain
   literal.
2. **Add the key to `DEFAULT_UI_STRINGS`** (flat dot-path, namespaced
   `filters.*`). The English string lives ONLY there — never as an inline
   fallback at the call site.
3. **Resolve in components** with `useUiString(key)` / `useUiStrings()` from
   `packages/frontend/src/ee/providers/Embed/useUiStrings.ts`. Pure functions
   (e.g. `filterLabels.ts` in common) instead take an optional trailing
   `getUiString?: UiStringResolver` that defaults to English — additive, so
   app-only callers are untouched.
4. **Dynamic parts** use `interpolateUiString(getUiString(key), { token })`
   with `{token}` placeholders. One key per English plural form
   (`.singular` / `.plural` / `.completedSingular` / `.completedPlural`) —
   no ICU, and never derive singulars by slicing the plural.
5. **Shipped keys are a public API** for SDK consumers, like the embed CSS
   class contract: additive only. Never rename, remove, or repurpose a key.
6. **Keep the demo bundles complete.** Add every new key, translated, to
   `packages/sdk-test-app/public/locales/{es,ka}/translation.json` under
   `uiOverrides`. Both are kept at 100% key coverage on purpose: flip the
   sdk-test-app to KA and any English viewer-visible string is a bug.
7. **Do NOT localize:** schema-derived content (field/table labels — that is
   `LanguageMap`/`contentOverrides` territory), as-code grammar serialization
   (`filterGrammarConversion.ts` output is parsed and must stay English), or
   option *values* (only their labels).

## Key files

- `packages/common/src/utils/i18n/uiStrings.ts` — the registry
- `packages/frontend/src/ee/providers/Embed/useUiStrings.ts` — the hook
- `packages/common/src/utils/filterLabels.ts` — the resolver-threading
  pattern for pure functions
- `packages/frontend/src/ee/providers/Embed/CLAUDE.md` — the delivery
  mechanism (`uiOverrides` prop → `EmbedProvider` → `t()`)
