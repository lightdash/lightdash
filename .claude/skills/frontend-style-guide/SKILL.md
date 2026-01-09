---
name: frontend-style-guide
description: Apply the Lightdash frontend style guide when working on React components, migrating Mantine v6 to v8, or styling frontend code. Use when editing TSX files, fixing styling issues, or when user mentions Mantine, styling, or CSS modules.
allowed-tools: Read, Edit, Write, Glob, Grep
---

# Lightdash Frontend Style Guide

Apply these rules when working on any frontend component in `packages/frontend/`.

## Mantine 8 Migration

**CRITICAL**: We are migrating from Mantine 6 to 8. Always upgrade v6 components when you encounter them.

## Component Checklist

When creating/updating components:

- [ ] Use `@mantine-8/core` imports
- [ ] No `style` or `styles` or `sx` props
- [ ] Check Mantine docs/types for available component props
- [ ] Use inline-style component props for styling when available (and follow <=3 props rule)
- [ ] Use CSS modules when component props aren't available or when more than 3 inline-style props are needed
- [ ] Theme values ('md', 'lg', 'xl', or 'ldGray.1', 'ldGray.2', 'ldDark.1', 'ldDark.2', etc) instead of magic numbers

## Quick Migration Guide

```tsx
// ❌ Mantine 6
import { Button, Group } from '@mantine/core';

<Group spacing="xs" noWrap>
    <Button sx={{ mt: 20 }}>Click</Button>
</Group>;

// ✅ Mantine 8
import { Button, Group } from '@mantine-8/core';

<Group gap="xs" wrap="nowrap">
    <Button mt={20}>Click</Button>
</Group>;
```

## Key Prop Changes

- `spacing` → `gap`
- `noWrap` → `wrap="nowrap"`
- `sx` → Component props (e.g., `mt`, `w`, `c`) or CSS modules
- `leftIcon` → `leftSection`
- `rightIcon` → `rightSection`

## Styling Best Practices

### Core Principle: Theme First

**The goal is to use theme defaults whenever possible.** Style overrides should be the exception, not the rule.

### Styling Hierarchy

1. **Best**: No custom styles (use theme defaults)
2. **Theme extension**: For repeated patterns, add to `mantine8Theme.ts`
3. **Component props**: Simple overrides (1-3 props like `mt="xl" w={240}`)
4. **CSS modules**: Complex styling or more than 3 props

### NEVER Use

- `styles` prop (always use CSS modules instead)
- `sx` prop (it's a v6 prop)
- `style` prop (inline styles)

### Theme Extensions (For Repeated Patterns)

If you find yourself applying the same style override multiple times, add it to the theme in `mantine8Theme.ts`:

```tsx
// In src/mantine8Theme.ts - inside the components object
components: {
    Button: Button.extend({
        styles: {
            root: {
                minWidth: '120px',
                fontWeight: 600,
            }
        }
    }),
}
```

### Context-Specific Overrides

#### Inline-style Component Props (1-3 simple props)

```tsx
// ✅ Good
<Button mt="xl" w={240} c="blue.6">Submit</Button>

// ❌ Bad - Too many props, use CSS modules instead
<Button mt={20} mb={20} ml={10} mr={10} w={240} c="blue.6" bg="white">Submit</Button>
```

Common inline-style props:
- Layout: `mt`, `mb`, `ml`, `mr`, `m`, `p`, `pt`, `pb`, `pl`, `pr`
- Sizing: `w`, `h`, `maw`, `mah`, `miw`, `mih`
- Colors: `c` (color), `bg` (background)
- Font: `ff`, `fs`, `fw`
- Text: `ta`, `lh`

#### CSS Modules (complex styles or >3 props)

Create a `.module.css` file in the same folder as the component:

```css
/* Component.module.css */
.customCard {
    transition: transform 0.2s ease;
    cursor: pointer;
}

.customCard:hover {
    transform: translateY(-2px);
    box-shadow: var(--mantine-shadow-lg);
}
```

```tsx
import styles from './Component.module.css';

<Card className={styles.customCard}>{/* content */}</Card>;
```

**Do NOT include `.css.d.ts` files** - Vite handles this automatically.

## Color Guidelines

**Prefer default component colors** - Mantine handles theme switching automatically.

When you need custom colors, use our custom scales for dark mode compatibility:

```tsx
// ❌ Bad - Standard Mantine colors (poor dark mode support)
<Text c="gray.6">Secondary text</Text>

// ✅ Good - ldGray for borders and neutral elements
<Text c="ldGray.6">Secondary text</Text>

// ✅ Good - ldDark for elements that appear dark in light mode
<Button bg="ldDark.8" c="ldDark.0">Dark button</Button>

// ✅ Good - Foreground/background variables
<Text c="foreground">Primary text</Text>
<Box bg="background">Main background</Box>
```

### Custom Color Scales

| Token | Purpose |
|-------|---------|
| `ldGray.0-9` | Borders, subtle text, neutral UI elements |
| `ldDark.0-9` | Buttons/badges with dark backgrounds in light mode |
| `background` | Page/card backgrounds |
| `foreground` | Primary text color |

## Always Use Theme Tokens

```tsx
// ❌ Bad - Magic numbers
<Box p={16} mt={24}>

// ✅ Good - Theme tokens
<Box p="md" mt="lg">
```

## Remove Dead Styles

Before moving styles to CSS modules, check if they're actually needed:

```tsx
// ❌ Unnecessary - display: block has no effect on flex children
<Flex justify="flex-end">
    <Button style={{display: 'block'}}>Submit</Button>
</Flex>

// ✅ Better - Remove the style entirely
<Flex justify="flex-end">
    <Button>Submit</Button>
</Flex>
```

## Theme-Aware Component Logic

For JavaScript logic that needs to know the current theme:

```tsx
import { useMantineColorScheme } from '@mantine/core';

const MyComponent = () => {
    const { colorScheme } = useMantineColorScheme();
    const iconColor = colorScheme === 'dark' ? 'blue.4' : 'blue.6';
    // ...
};
```

## Reusable Components

### Modals

- **Always use `MantineModal`** from `components/common/MantineModal` - never use Mantine's Modal directly
- See `stories/Modal.stories.tsx` for usage examples
- For forms inside modals: use `id` on the form and `form="form-id"` on the submit button
- For alerts inside modals: use `Callout` with variants `danger`, `warning`, `info`

### Callouts

- Use `Callout` from `components/common/Callout`
- Variants: `danger`, `warning`, `info`

## Mantine Documentation

Component props and APIs: `https://mantine.dev/core/[component-name]/`

**Tip**: In your IDE, hover over a component or use Go to Definition to see all available props.
