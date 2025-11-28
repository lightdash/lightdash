## 🎨 Frontend Style Guide

**CRITICAL**: Before working on any frontend component, read
the [Frontend Style Guide](STYLE_GUIDE.md). Key points:

-   **Use Mantine v8 only** - Migrate any Mantine v6 components you encounter
-   **Styling hierarchy**:
    1. Inline-style component props (≤3 simple layout props like `mt`, `p`, `w`)
    2. CSS modules (default choice when more than 3 inline-style props are needed or when component props aren't available)
    3. Theme extensions for reusable styles
-   **NEVER use** `styles`(v8) or `sx`(v6) props or `style`(v6/v8)
-   **Prop changes** - `spacing` → `gap`, `noWrap` → `wrap="nowrap"`, `sx` → `style` (v6)
-   **Component docs** - Props/APIs at `https://mantine.dev/core/[component-name]/` (e.g. select, segmented-control)

## 🌙 Dark Mode

### Use new `ldDark`/`ldGray` color tokens, NOT `dark`/`gray`

**`ldDark` and `ldGray` automatically switch values between light/dark modes. Mantine's default `dark` and `gray` do NOT.**

| Token        | Light Mode                      | Dark Mode                        | Use For                           |
| ------------ | ------------------------------- | -------------------------------- | --------------------------------- |
| `ldGray`     | Light grays (#f8f9fa → #212529) | Dark grays (#2e2e32 → #d9d9df)   | Borders, text, subtle backgrounds |
| `ldDark`     | Dark shades (#C9C9C9 → #141414) | Light shades (#f3f5ff → #18181a) | Inverted contrast elements        |
| `background` | #FEFEFE (white)                 | #1A1B1E (dark)                   | Page/card backgrounds             |
| `foreground` | #1A1B1E (dark)                  | #FEFEFE (white)                  | Primary text color                |

Defined in: `src/mantineTheme.ts`

```tsx
// ❌ NEVER use - doesn't switch between modes
<Box bg="gray.1" c="dark.9">

// ✅ ALWAYS use - auto-switches
<Box bg="ldGray.1" c="ldDark.9">
<Box bg="background.0" c="foreground.0">
```

### Detecting Color Scheme in Components

Use `useMantineColorScheme` when you need mode-specific logic:

```tsx
import { useMantineColorScheme } from '@mantine/core';

const { colorScheme } = useMantineColorScheme();
const isDark = colorScheme === 'dark';
```

### CSS Modules: `@mixin dark` / `@mixin light`

Use PostCSS mixins for mode-specific overrides (via `postcss-preset-mantine`):

```css
/* Component.module.css */
.card {
    background: var(--mantine-color-ldGray-0); /* works for most cases */
}

/* When ldGray/ldDark tokens aren't enough (e.g., brand colors): */
.highlight {
    background: var(--mantine-color-indigo-0);

    @mixin dark {
        background: var(--mantine-color-indigo-8);
    }
}
```

### Legacy `createStyles` and `sx` props (Mantine v6)

For code still using `createStyles` or `sx` props, use ternary on `theme.colorScheme`:

```tsx
const useStyles = createStyles((theme) => ({
    item: {
        backgroundColor:
            theme.colorScheme === 'dark'
                ? theme.colors.blue[8]
                : theme.colors.blue[0],
    },
}));
```

```tsx
<Box sx={{ backgroundColor: theme.colorScheme === 'dark' ? theme.colors.blue[8] : theme.colors.blue[0] }}>
```

### Best Practice: Minimal Customization

Rely on Mantine defaults and theme tokens. Custom overrides should be rare:

1. **First**: Use `ldGray`/`ldDark`/`background`/`foreground` tokens
2. **Second**: Use `@mixin dark` in CSS modules for brand colors
3. **Avoid**: Per-component color logic unless absolutely necessary

### Reference

-   Mantine 8 Styles: https://mantine.dev/styles/styles-overview/
-   Mantine 6 Styles: https://v6.mantine.dev/styles/rem/
-   PostCSS Preset Mantine: https://mantine.dev/styles/postcss-preset/
