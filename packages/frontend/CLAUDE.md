## 🎨 Frontend Style Guide

**CRITICAL**: Before working on any frontend component, read
the [Frontend Style Guide](../../.cursor/rules/frontend.mdc). Key points:

-   **Use Mantine v8 only** - Migrate any Mantine v6 components you encounter
-   **Prefer Mantine components over raw HTML elements** - `Box` instead of `<div>`, `Text` instead of `<p>`/`<span>` for copy, `Group`/`Stack` for flex layouts. This applies even when mirroring existing code that uses raw elements - older files predate the rule and are not a licence to copy the pattern
-   **Styling hierarchy**:
    1. Inline-style component props (≤3 simple layout props like `mt`, `p`, `w`)
    2. CSS modules (default choice when more than 3 inline-style props are needed or when component props aren't available)
    3. Theme extensions for reusable styles
-   **NEVER use** `styles`(v8) or `sx`(v6) props or `style`(v6/v8)
-   **Colors**: Prefer default component colors (auto-theme switching). For custom colors, use `ldGray.X` and `ldDark.X`, not standard `gray.X`
-   **Prop changes** - `spacing` → `gap`, `noWrap` → `wrap="nowrap"`, `sx` → `style` (v6)
-   **Shared layout vars** - Heights/widths/z-indexes (navbar, page content, sidebar, dashboard header/tabs) are global CSS vars sourced from `*/constants.ts` via `src/theme/cssVariablesResolver.ts`. Reference `var(--name)` in CSS; don't hardcode the literal or bridge it through an inline `style`. To add one: constant → resolver → `var()`.
-   **Component docs** - Props/APIs at `https://mantine.dev/core/[component-name]/` (e.g. select, segmented-control)

## 🎛️ Theme

The theme lives in `src/theme/`: `colors.ts` (neutral ramps, `primary` is the ink color), `index.ts` (type scale, radius, shadows), `cssVariablesResolver.ts` (semantic tokens) and `components/` (one CSS module per component plus the registry in `components/index.ts`).

-   **Use semantic tokens, not `light-dark()` pairs**: `--mantine-color-body` (surface), `--ld-color-page` (canvas), `--mantine-color-default-border`, `--mantine-color-default-hover`, `--mantine-color-text`, `--mantine-color-dimmed`, `--mantine-color-placeholder`. They resolve per scheme already.
-   **`ldGray.N` means the same thing in both schemes**: 0 canvas, 1 muted fill, 2 border, 3 strong border, 4 faint icon, 5 tertiary text, 6 secondary text (same as `dimmed`), 7 label, 9 text.
-   **Defaults you get for free**: Paper/Card are bordered, flat (no shadow), 12px radius; Menu/Popover carry the `md` shadow; ActionIcon is `subtle`; Badge is `light` gray; Button sizes are 28/32/36/40px. Do not restate these at call sites.
-   **Add a variant, not a one-off**: repeated overrides belong in `src/theme/components/<Component>.module.css`. Reach for the theme's `vars` callback only when Mantine writes the value inline (button/badge colors, NavLink fill, input font size).
-   **Check both schemes** in the `Theme/Gallery` story (`src/stories/ThemeGallery.stories.tsx`) before shipping a theme change.

## 🧩 Reusable Components

-   **Modals**: Always use `MantineModal` from `components/common/MantineModal`. See `stories/Modal.stories.tsx` for examples.
-   **Callouts**: Use `Callout` from `components/common/Callout` with variants: `danger`, `warning`, `info`
-   **Number inputs**: Always use `NumberInput` from `components/common/NumberInput`. Prefer `onNumberChange` (fires `number`, or `undefined` on clear; never transient strings). Integer-only by default; decimal fields opt in via `decimalScale={n}` or `decimalScale="unlimited"`. Raw `onChange` only for `form.getInputProps()` spreads.

## ⚛️ State Management

### Don't sync props/server-state into `useState` via `useEffect`

If a `useEffect` body is `setX(propOrQueryValue)`, it's almost always the wrong pattern. It re-runs on every refetch/parent re-render and silently clobbers user edits.

```tsx
// ❌ Anti-pattern
const [name, setName] = useState('');
useEffect(() => {
    if (design) setName(design.name);
}, [design]); // clobbers user edits on every refetch
```

Use one of these instead:

1. **Form state → `useForm` from `@mantine/form`** (the codebase standard — see `features/dashboardTabs/EditTabModal.tsx`). Initial values are captured on mount only; refetches don't overwrite them.

    ```tsx
    const form = useForm({
        initialValues: { name: design.name, description: design.description ?? '' },
    });
    // <TextInput {...form.getInputProps('name')} />
    ```

2. **When initial values come from an async query**, split the component: outer fetches + handles loading, inner takes the loaded data as a prop and uses `useForm`. Mount the inner with `key={entity.uuid}` so it re-initialises when the user switches entities but not on refetches of the same entity.

    ```tsx
    // Outer
    if (!design) return <Loader />;
    return <DesignForm key={design.designUuid} design={design} />;
    ```

3. **Reset-on-modal-open / reset-on-close**: don't `useEffect` on `opened`. Either reset in your `handleClose` (matches `EditTabModal`), or pass `key={someId}` to remount the modal body.

4. **Derived values**: compute during render. Don't mirror a derived value into state.

    ```tsx
    // ❌    const [hasChanges, setHasChanges] = useState(false);
    //       useEffect(() => setHasChanges(name !== design.name), [name, design]);
    // ✅    const hasChanges = name !== design.name;
    ```

`useEffect` is for **synchronising with external systems** (subscriptions, timers, imperative DOM/3rd-party libs) — not for keeping two pieces of React state in sync.
