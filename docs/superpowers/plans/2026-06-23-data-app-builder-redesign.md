# Build a Data App — landing redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the new-app "Build a Data App" landing into one chat-first screen: an always-visible composer, the four starting points as cards fanned in an arch, and theme as a pill on the composer's bottom bar.

**Architecture:** Collapse the existing `showTemplatePicker` + `composeMode` stages of `AppGenerate.tsx` into a single centered landing that renders the fanned-arch `AppTemplatePicker` above the existing composer. `AppTemplatePicker` becomes a controlled, presentational selection surface (nullable, nothing pre-selected, dark/neutral accent). Theme moves out of the picker into a compact `ThemePicker` pill in the composer's bottom-left. The post-submit split layout (chat + preview) is unchanged.

**Tech Stack:** React 19, Mantine v8 (`@mantine-8/core`), CSS modules, TanStack Query, Vitest + React Testing Library.

## Global Constraints

- Mantine v8 only (`@mantine-8/core`). Never use `styles`/`sx`/`style` props; use CSS modules (this redesign is well past the 3-inline-prop threshold). — frontend `CLAUDE.md` / `STYLE_GUIDE.md`
- Custom colors via `ldGray.X` / `ldDark.X` / `dark.X`, never bare `gray.X`. Selected-card accent is **neutral/dark, not blue**.
- Comments: one line max, default zero. No internal/ticket references in source.
- Prefer strict types; nullable selection is `DataAppTemplate | null` (explicit `null`, not optional).
- Don't sync props/server-state into `useState` via `useEffect` (frontend `CLAUDE.md`).
- `DataAppTemplate` values are unchanged; `null` selection maps to `'custom'` at submit.
- Run package-scoped checks: `pnpm -F frontend typecheck:fast`, `pnpm -F frontend lint`.

---

### Task 1: Add a compact pill variant to `ThemePicker`

Theme moves from the picker's labelled row into the composer bottom bar, where the existing 200px two-line trigger is too large. Add an opt-in `compact` pill trigger; the popover dropdown and all selection logic are untouched.

**Files:**
- Modify: `packages/frontend/src/features/organizationDesigns/components/ThemePicker.tsx`
- Modify: `packages/frontend/src/features/organizationDesigns/components/ThemePicker.module.css`
- Test: `packages/frontend/src/features/organizationDesigns/components/ThemePicker.test.tsx` (create)

**Interfaces:**
- Consumes: `useOrganizationDesigns()` (existing).
- Produces: `ThemePicker` gains prop `compact?: boolean`. When `compact`, the trigger renders a single-line pill: a small swatch dot + the theme `label` + chevron, min-width removed. `value`/`onChange`/`disabled`/`lockedAfterCreation` semantics unchanged.

- [ ] **Step 1: Write the failing test**

```tsx
// ThemePicker.test.tsx
import { MantineProvider } from '@mantine-8/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ThemePicker } from './ThemePicker';

vi.mock('../hooks/useOrganizationDesigns', () => ({
    useOrganizationDesigns: () => ({ data: [] }),
}));

const renderPicker = (props: Partial<React.ComponentProps<typeof ThemePicker>> = {}) =>
    render(
        <MemoryRouter>
            <MantineProvider>
                <ThemePicker value={null} onChange={vi.fn()} {...props} />
            </MantineProvider>
        </MemoryRouter>,
    );

describe('ThemePicker compact', () => {
    it('renders the no-theme label as a single-line pill trigger', () => {
        renderPicker({ compact: true });
        const trigger = screen.getByRole('button', { name: /Theme: No theme/i });
        expect(trigger).toBeInTheDocument();
        // Description line is suppressed in compact mode.
        expect(
            screen.queryByText('No shared design assets - prompt any style you want'),
        ).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F frontend vitest run src/features/organizationDesigns/components/ThemePicker.test.tsx`
Expected: FAIL — description text is still rendered (compact prop not implemented).

- [ ] **Step 3: Implement the compact trigger**

In `ThemePicker.tsx`, add `compact?: boolean` to `Props` and branch the `button` definition. Keep the existing (non-compact) button as-is; add the compact variant:

```tsx
type Props = {
    value: string | null;
    onChange: (designUuid: string | null) => void;
    disabled?: boolean;
    lockedAfterCreation?: boolean;
    compact?: boolean;
};
```

```tsx
// inside the component, replacing the single `button` const:
const button = compact ? (
    <Button
        variant="default"
        size="xs"
        radius="xl"
        color="gray"
        h="auto"
        py={6}
        onClick={() => setOpened((o) => !o)}
        disabled={disabled || lockedAfterCreation}
        leftSection={<Box className={classes.swatch} />}
        rightSection={<MantineIcon icon={IconChevronDown} size={12} />}
        aria-label={`Theme: ${label}`}
    >
        <Text size="sm" fw={500} lh={1.2} lineClamp={1}>
            {label}
        </Text>
    </Button>
) : (
    /* existing button JSX unchanged */
);
```

Add `Box` to the `@mantine-8/core` import if not present (it is). Add to `ThemePicker.module.css`:

```css
.swatch {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    background: linear-gradient(135deg, var(--mantine-color-ldGray-3), var(--mantine-color-ldGray-5));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F frontend vitest run src/features/organizationDesigns/components/ThemePicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
pnpm -F frontend typecheck:fast && pnpm -F frontend lint
git add packages/frontend/src/features/organizationDesigns/components/ThemePicker.tsx \
        packages/frontend/src/features/organizationDesigns/components/ThemePicker.module.css \
        packages/frontend/src/features/organizationDesigns/components/ThemePicker.test.tsx
git commit -m "feat(apps): compact pill variant for ThemePicker"
```

---

### Task 2: Rework `AppTemplatePicker` into a controlled fanned arch

Replace the 2×2 `SimpleGrid` + theme row + "Let's go!" button with an absolutely-positioned arch of four cards. The component becomes controlled and presentational: it renders the current selection and reports changes; it no longer owns highlight state, theme, or a confirm button.

**Files:**
- Rewrite: `packages/frontend/src/features/apps/AppTemplatePicker.tsx`
- Rewrite: `packages/frontend/src/features/apps/AppTemplatePicker.module.css`
- Test: `packages/frontend/src/features/apps/AppTemplatePicker.test.tsx` (create)

**Interfaces:**
- Consumes: `TEMPLATES` from `./templates`, `DataAppTemplate` from `@lightdash/common`.
- Produces: new prop contract
  ```ts
  type Props = {
      selected: DataAppTemplate | null;
      onSelectedChange: (template: DataAppTemplate | null) => void;
  };
  ```
  Clicking an unselected card calls `onSelectedChange(template)`; clicking the already-selected card calls `onSelectedChange(null)` (deselect). No theme props, no `onSelect`, no "Let's go!" button.

- [ ] **Step 1: Write the failing tests**

```tsx
// AppTemplatePicker.test.tsx
import { MantineProvider } from '@mantine-8/core';
import { fireEvent, render, screen } from '@testing-library/react';
import AppTemplatePicker from './AppTemplatePicker';

const setup = (selected: 'dashboard' | 'slideshow' | 'pdf' | 'custom' | null, onSelectedChange = vi.fn()) => {
    render(
        <MantineProvider>
            <AppTemplatePicker selected={selected} onSelectedChange={onSelectedChange} />
        </MantineProvider>,
    );
    return { onSelectedChange };
};

describe('AppTemplatePicker', () => {
    it('renders all four starting points and no Lets go button', () => {
        setup(null);
        expect(screen.getByRole('button', { name: /Dashboard/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Slide Show/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /PDF Report/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /From scratch/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Let's go/i })).not.toBeInTheDocument();
    });

    it('nothing is selected by default', () => {
        setup(null);
        expect(
            screen.queryByRole('button', { pressed: true }),
        ).not.toBeInTheDocument();
    });

    it('selecting a card reports the template', () => {
        const { onSelectedChange } = setup(null);
        fireEvent.click(screen.getByRole('button', { name: /Slide Show/i }));
        expect(onSelectedChange).toHaveBeenCalledWith('slideshow');
    });

    it('clicking the selected card deselects it', () => {
        const { onSelectedChange } = setup('dashboard');
        fireEvent.click(screen.getByRole('button', { name: /Dashboard/i }));
        expect(onSelectedChange).toHaveBeenCalledWith(null);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -F frontend vitest run src/features/apps/AppTemplatePicker.test.tsx`
Expected: FAIL — component still has old `onSelect`/theme props and a "Let's go!" button.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `AppTemplatePicker.tsx`:

```tsx
import { type DataAppTemplate } from '@lightdash/common';
import { Group, Stack, Text, ThemeIcon } from '@mantine-8/core';
import { IconCheck } from '@tabler/icons-react';
import { type FC } from 'react';
import { PolymorphicPaperButton } from '../../components/common/PolymorphicPaperButton';
import classes from './AppTemplatePicker.module.css';
import { TEMPLATES } from './templates';

type Props = {
    selected: DataAppTemplate | null;
    onSelectedChange: (template: DataAppTemplate | null) => void;
};

const AppTemplatePicker: FC<Props> = ({ selected, onSelectedChange }) => (
    <div className={classes.fan}>
        {TEMPLATES.map((template, index) => {
            const Icon = template.icon;
            const isSelected = selected === template.id;
            return (
                <PolymorphicPaperButton
                    key={template.id}
                    component="button"
                    type="button"
                    radius="md"
                    className={`${classes.card} ${isSelected ? classes.cardSelected : ''}`}
                    data-pos={index}
                    aria-pressed={isSelected}
                    data-selected={isSelected ? 'true' : undefined}
                    onClick={() =>
                        onSelectedChange(isSelected ? null : template.id)
                    }
                >
                    <Stack gap="xs" align="flex-start">
                        <ThemeIcon
                            size="lg"
                            radius="md"
                            variant="light"
                            color="gray"
                            className={classes.cardIcon}
                        >
                            <Icon size={20} />
                        </ThemeIcon>
                        <Stack gap={4} className={classes.cardContent}>
                            <Text fw={600} size="sm" className={classes.cardTitle}>
                                {template.title}
                            </Text>
                            <Text size="xs" c="dimmed">
                                {template.description}
                            </Text>
                        </Stack>
                    </Stack>
                    {isSelected && (
                        <ThemeIcon
                            size={20}
                            radius="xl"
                            color="dark"
                            className={classes.selectedIndicator}
                        >
                            <IconCheck size={12} stroke={3} />
                        </ThemeIcon>
                    )}
                </PolymorphicPaperButton>
            );
        })}
    </div>
);

export default AppTemplatePicker;
```

- [ ] **Step 4: Rewrite the CSS module**

Replace the entire contents of `AppTemplatePicker.module.css` with the arch geometry (validated in the brainstorm mockup). The four cards are placed by per-`data-pos` custom props; selected/hover lift in place with a dark/neutral accent.

```css
.fan {
    position: relative;
    width: 100%;
    max-width: 720px;
    height: 260px;
    margin: 0 auto;
}

.card {
    position: absolute;
    top: 40px;
    left: 50%;
    width: 184px;
    height: 166px;
    padding: var(--mantine-spacing-md);
    border: 1px solid var(--mantine-color-default-border);
    border-radius: var(--mantine-radius-lg);
    text-align: left;
    font: inherit;
    color: inherit;
    cursor: pointer;
    transform: translate(calc(var(--x) - 92px), var(--y)) rotate(var(--rot));
    transition:
        transform 220ms cubic-bezier(0.2, 0.7, 0.3, 1),
        border-color 180ms ease,
        background-color 180ms ease,
        box-shadow 180ms ease;

    @mixin light {
        background-color: var(--mantine-color-white);
        box-shadow: 0 8px 22px -8px alpha(var(--mantine-color-black), 0.18);
    }
    @mixin dark {
        background-color: var(--mantine-color-dark-6);
        box-shadow: 0 8px 22px -8px alpha(var(--mantine-color-black), 0.5);
    }
}

.card[data-pos='0'] { --x: -258px; --y: 44px; --rot: -15deg; z-index: 1; }
.card[data-pos='1'] { --x: -88px;  --y: 2px;  --rot: -5deg;  z-index: 2; }
.card[data-pos='2'] { --x: 88px;   --y: 2px;  --rot: 5deg;   z-index: 3; }
.card[data-pos='3'] { --x: 258px;  --y: 44px; --rot: 15deg;  z-index: 4; }

.card:hover,
.card:focus-visible {
    outline: none;
    transform: translate(calc(var(--x) - 92px), calc(var(--y) - 28px))
        rotate(calc(var(--rot) * 0.35)) scale(1.04);
    z-index: 10;

    @mixin light {
        border-color: var(--mantine-color-ldGray-4);
        box-shadow: 0 22px 46px -10px alpha(var(--mantine-color-black), 0.28);
    }
    @mixin dark {
        border-color: var(--mantine-color-dark-3);
        box-shadow: 0 22px 46px -10px alpha(var(--mantine-color-black), 0.6);
    }
}

.cardSelected,
.cardSelected:hover {
    transform: translate(calc(var(--x) - 92px), calc(var(--y) - 24px))
        rotate(calc(var(--rot) * 0.35)) scale(1.04);
    z-index: 9;

    @mixin light {
        border-color: var(--mantine-color-dark-9);
        background-color: var(--mantine-color-ldGray-0);
        box-shadow:
            0 0 0 1px var(--mantine-color-dark-9),
            0 18px 40px -10px alpha(var(--mantine-color-black), 0.22);
    }
    @mixin dark {
        border-color: var(--mantine-color-ldGray-0);
        background-color: var(--mantine-color-dark-5);
        box-shadow:
            0 0 0 1px var(--mantine-color-ldGray-0),
            0 18px 40px -10px alpha(var(--mantine-color-black), 0.6);
    }
}

.card[data-selected='true'] .cardIcon {
    @mixin light {
        background-color: var(--mantine-color-dark-9);
        color: var(--mantine-color-white);
    }
    @mixin dark {
        background-color: var(--mantine-color-ldGray-0);
        color: var(--mantine-color-dark-9);
    }
}

.cardIcon { flex-shrink: 0; }
.cardContent { min-width: 0; }
.cardTitle { line-height: 1.2; }

.selectedIndicator {
    position: absolute;
    top: var(--mantine-spacing-sm);
    right: var(--mantine-spacing-sm);
}

/* Narrow widths can't hold the arch — stack the cards vertically. */
@media (max-width: 760px) {
    .fan {
        height: auto;
        display: flex;
        flex-direction: column;
        gap: var(--mantine-spacing-sm);
    }
    .card {
        position: static;
        width: 100%;
        height: auto;
        transform: none;
    }
    .card:hover,
    .card:focus-visible,
    .cardSelected,
    .cardSelected:hover {
        transform: none;
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -F frontend vitest run src/features/apps/AppTemplatePicker.test.tsx`
Expected: PASS (all four tests).

- [ ] **Step 6: Typecheck, lint, commit**

```bash
pnpm -F frontend typecheck:fast && pnpm -F frontend lint
git add packages/frontend/src/features/apps/AppTemplatePicker.tsx \
        packages/frontend/src/features/apps/AppTemplatePicker.module.css \
        packages/frontend/src/features/apps/AppTemplatePicker.test.tsx
git commit -m "feat(apps): fanned-arch starting-point cards"
```

---

### Task 3: Merge the picker + compose stages in `AppGenerate`

Remove the separate `showTemplatePicker` stage and the `composeMode` pick→confirm hop. The new-app empty screen now renders the arch above the always-present composer, with the theme pill in the composer's bottom-left.

**Files:**
- Modify: `packages/frontend/src/pages/AppGenerate.tsx`
- Modify: `packages/frontend/src/pages/AppGenerate.module.css` (only if `composeLayout`/`pickerLayout` need consolidation — see Step 6)

**Interfaces:**
- Consumes: Task 2's `AppTemplatePicker` (`selected` / `onSelectedChange`); Task 1's `ThemePicker` `compact` prop.
- Produces: no exported API change; internal stage flags simplified.

- [ ] **Step 1: Remove the wizard-stage state and derived flags**

In `AppGenerate.tsx`:

- Delete the `wizardStage` state (line ~482): `const [wizardStage, setWizardStage] = useState<'pick' | 'confirm'>('pick');`
- Delete `wizardCoversInput` (lines ~899-903) and replace its two usages (`!wizardCoversInput &&` at ~2412 and ~2469) with the existing `isViewingOlderVersion`-based guards — i.e. drop the `!wizardCoversInput &&` prefix so those blocks render whenever their existing condition holds.
- Delete `showTemplatePicker` (lines ~908-912).
- Replace `composeMode` (lines ~918-922) with a `newAppLanding` flag that no longer depends on a template having been picked:

```tsx
// New-app empty screen: arch + composer, centered, no preview/split yet.
const newAppLanding =
    isNewApp && messages.length === 0 && !isLoading;
```

- [ ] **Step 2: Replace `composeMode` references with `newAppLanding`**

Throughout the render (lines ~1475, ~1835-1854, ~1876, ~1920, ~2778, ~2783), rename every `composeMode` to `newAppLanding`. Behaviour is identical except the screen now always shows (no template pick required).

- [ ] **Step 3: Delete the dead template/back handlers and the standalone picker return**

- Delete `handleTemplateSelect` (lines ~1775-1792) and `handleBackToTemplates` (lines ~1794-1800).
- Delete the `composeBackBar` block (lines ~1854-1875) — there's nothing to go back to now.
- Replace the top-level `return showTemplatePicker ? (...) : (` ternary (line ~1826) with just the `Box` branch:

```tsx
    return (
        <Box className={newAppLanding ? classes.composeLayout : classes.layout}>
```

(Remove the `<Box className={classes.pickerLayout}><AppTemplatePicker .../></Box>` branch and the closing `) : (` / trailing `)`.)

- [ ] **Step 4: Render the arch inside the landing heading**

In the `newAppLanding` heading block (the former `composeMode &&` Stack at ~1876-1891), render the arch under the title/subtitle:

```tsx
{newAppLanding && (
    <Stack gap="lg" className={classes.composeHeading}>
        <Stack gap={6}>
            <Text fw={700} fz={28} className={classes.composeTitle}>
                Build a Data App
            </Text>
            <Text size="sm" c="dimmed">
                Pick a starting point, then describe what you want to build.
            </Text>
        </Stack>
        <AppTemplatePicker
            selected={selectedTemplate}
            onSelectedChange={setSelectedTemplate}
        />
    </Stack>
)}
```

Ensure `AppTemplatePicker` stays imported (it is, line ~104). `selectedTemplate` already defaults to `null` (line ~462) — nothing pre-selected, satisfying the spec.

- [ ] **Step 5: Add the theme pill to the composer bottom bar**

In the bottom-row left side (line ~2642, the `<AttachButton .../>`), wrap so the theme pill — and, when a template is selected, a **"Starting from …" chip** — sit to its left, only on the new-app landing. Theme is locked after creation, so existing apps keep today's behaviour (pill/chip hidden here; theme iteration still works elsewhere). The selected-template label lives **inside** the input's bottom bar next to the theme pill, not as external text below the composer:

```tsx
<Group gap="xs">
    {newAppLanding && (
        <ThemePicker
            compact
            value={currentThemeUuid}
            onChange={handleThemeChange}
        />
    )}
    {newAppLanding && selectedTemplate !== null && (
        <Text size="xs" c="dimmed" className={classes.startingFromChip}>
            Starting from{' '}
            <Text span fw={600} c="dark">
                {getTemplate(selectedTemplate).title}
            </Text>
        </Text>
    )}
    <AttachButton
        /* ...existing props unchanged... */
    />
</Group>
```

Add the imports near the other feature imports:

```tsx
import { ThemePicker } from '../features/organizationDesigns/components/ThemePicker';
import { getTemplate } from '../features/apps/templates';
```

`getTemplate` already exists in `templates.ts` (returns `{ title, ... }`). `currentThemeUuid` and `handleThemeChange` already exist (lines ~1002-1007). Add a small style for vertical alignment to `AppGenerate.module.css`:

```css
.startingFromChip {
    white-space: nowrap;
    align-self: center;
}
```

Because the chip and the `AppTemplatePicker` both read/write `selectedTemplate`, selecting a card updates the chip live, and deselecting (clicking the active card) removes it — no extra state. Do **not** render any "Starting from" text below/outside the composer.

- [ ] **Step 6: Reconcile layout CSS**

The standalone `.pickerLayout` class is now unused. In `AppGenerate.module.css`, delete the `.pickerLayout` rule. Keep `.composeLayout` (now the new-app landing) and `.layout` (split). If `.composeHeading` constrained height for a single centered card, ensure it now allows the arch (≈260px) plus composer without clipping — give `.composeLayout` `overflow: visible` / sufficient `max-height` so the arch's lifted cards aren't cropped. Verify visually in Step 8.

- [ ] **Step 7: Typecheck and lint**

Run: `pnpm -F frontend typecheck:fast && pnpm -F frontend lint`
Expected: PASS, no unused-symbol errors (confirms `wizardStage`, `showTemplatePicker`, `handleTemplateSelect`, `handleBackToTemplates`, `wizardCoversInput`, `pickerLayout` are fully removed). Also run `pnpm -F frontend unused-exports`.

- [ ] **Step 8: Manual verification (Chrome DevTools MCP)**

Navigate to `/projects/<uuid>/apps/generate` in the running dev app (login `demo@lightdash.com` / `demo_password!`). Screenshot and confirm:
1. Composer is visible immediately; the four cards fan in an arch above it; **nothing selected by default**.
2. Hover lifts a card; click selects (dark/neutral accent + ✓); clicking the selected card deselects. On select, a "Starting from **<Template>**" chip appears **inside** the input's bottom bar next to the theme pill (not below the composer); deselecting removes it.
3. Theme pill sits bottom-left of the input; opening it shows the theme popover; send button bottom-right.
4. Typing a prompt and submitting morphs to the split layout (chat + preview) with no visual jump; the build still receives the chosen template (`selectedTemplate ?? undefined` at lines ~1633/1642/1691 — unchanged), and `null` selection builds as `'custom'`.
5. Resize narrow (<760px): cards fall back to a vertical stack, still readable.

- [ ] **Step 9: Commit**

```bash
git add packages/frontend/src/pages/AppGenerate.tsx packages/frontend/src/pages/AppGenerate.module.css
git commit -m "feat(apps): single-screen data app landing with arch picker + theme pill"
```

---

## Self-Review Notes

- **Spec coverage:** chat always shown → Task 3 Step 1-4 (`newAppLanding`, composer always rendered). Fanned arch → Task 2. Theme pill bottom-left → Task 1 (compact) + Task 3 Step 5. Dark accent / nothing selected by default → Task 2 (CSS + `selected` default `null`). Stage merge / remove "Let's go!" + THEME row → Task 2 + Task 3. Unchanged split/backend → Task 3 leaves submit payload and preview panel intact.
- **Type consistency:** `AppTemplatePicker` props `selected: DataAppTemplate | null` / `onSelectedChange` used identically in Task 2 and Task 3; `ThemePicker` `compact?: boolean` defined Task 1, consumed Task 3.
- **Out of scope:** existing-app edit route (theme pill gated on `newAppLanding`), message history, model/attachments — untouched.
