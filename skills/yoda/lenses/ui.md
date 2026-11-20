# UI

## Review

- **Skip when:** frontend tests and stories only, or frontend code that only changes the values a query is sent with (Core).
- **Worst case:** a dashboard tile or embed that crashes, or an embedded viewer who sees Lightdash branding or loses saved filters.
- **Evidence:** use supplied screenshots, or the running app at `deep`, in light and dark and in an embed when the component can reach one.
  At `quick`, inspect rendering, state and layout code for checks screenshots don't settle.
- **states:** loading, empty and error states exist for anything that fetches; a 403, an access error or a failed SQL run shows an error in the tile, never a thrown render error, an endless loader or "No data available".
- **crash shapes:** values from config or the API are checked before string, array or index methods (tooltip templates, formatters, `columnOrder`, dates that parse to "Invalid date"); effects and the callbacks they call have stable dependencies, so no "Maximum update depth"; charts and maps handle unmount and empty data.
- **mirrors permissions:** controls are hidden or disabled for users who can't act (the backend check belongs to Access).
- **embed:** no Lightdash name, docs link, upsell or tour reaches an embed (`useIsEmbedded()`, `DocumentationHelpButton`); errors say "the server"; strings an embedded viewer sees go through `uiStrings.ts` where the file exists.
  For persistence, apply [Embed’s save check](embed.md).
- **copy:** words name things the way users know them ("live data source", never "connection").
- **server state:** API data lives in TanStack Query, not `useState` or an effect mirror; query keys hold every input that changes the result (refresh counter, filters, parameters); every mutation invalidates the keys it changes.
- **forms and hooks:** `useForm` for form state; async initial values load outside the form, which is keyed by uuid; rules of hooks hold and effects clean up.
- **Mantine:** Mantine v8 only, no `sx`, `styles` or `style` props, `MantineModal` and the shared inputs, semantic colour tokens; `data-tour-*` attributes kept.
- **dashboards:** drag, resize, tab switches, narrow widths and date zoom keep tiles, filters and parameters where they were; a large change to filters, tables or tile rendering sits behind a flag or is split.
- **saved content:** existing charts and dashboards render the same in every host (Explorer, dashboard, Documents, embed, minimal view, SQL charts).
- **accessible:** semantic elements, keyboard navigation, focus handled in modals and menus, and labels on inputs.

## Impact

- **breaking:** a working flow or saved-content host fails.
- **notable:** changed control action, access steps, screen/menu placement, defaults or saved-content rendering.
- **minor:** new product control or appearance/copy changes retaining action and access steps.

## Diff

```ts
type UiDiff = Diff;
```

- **Name:** the screen or control as users know it (`Share modal`, `Dashboard filters`).
- **Note:** what users see or can do now.
- **Granularity:** one diff per screen or control whose behaviour changes, however many changes it holds.
  A visible change that keeps behaviour (a renamed button, a restyle, a layout fix) is one `minor` diff for its screen; colours or spacing nobody would report, and refactors, get none.

```json
{ "lens": "UI", "change": "modified", "impact": "minor", "name": "Share modal", "note": "restricted spaces say \"Private\" with one member" }
```
