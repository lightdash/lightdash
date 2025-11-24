# Lightdash Frontend Style Guide

## Mantine 8 Migration

**CRITICAL**: We are migrating from Mantine 6 to 8. Always upgrade v6 components when you encounter them.

## Component Checklist

When creating/updating components:

-   [ ] Use `@mantine-8/core` imports
-   [ ] Follow Quick Migration Guide below and then make reasoning in section ### When to Override Styles
-   [ ] Confirm you know the guidelines in section ### 1. Theme Extensions (For Repeated Patterns) and section ### 2. Context-Specific Overrides (for simple overrides)
-   [ ] No `style` or `styles` or `sx` props
-   [ ] Check Mantine docs/types for available component props
-   [ ] Use inline-style component props for styling when available (and follow <=3 props rule; if more than 3 props, use CSS modules)
-   [ ] Use CSS modules when component props aren't available or when more than 3 inline-style props are needed
-   [ ] Theme values('md', 'lg', 'xl', or 'ldGray.1', 'ldGray.2', etc) instead of magic numbers

### Quick Migration Guide

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

### Key Prop Changes

-   `spacing` → `gap`
-   `noWrap` → `wrap="nowrap"`
-   `sx` → Component props (e.g., `mt`, `w`, `c`) or CSS modules if it's not possible to use component props. Also follow the best practices below in section ### When to Override Styles.
-   `leftIcon` → `leftSection`
-   `rightIcon` → `rightSection`

## Styling Best Practices

### Core Principle: Theme First

**The goal is to use theme defaults whenever possible.** Style overrides should be the exception, not the rule.

#### Quick Reference

```tsx
// 1. Best: No custom styles (use theme defaults)
<Button>Submit</Button>

// 2. Theme extension (for repeated patterns)
// If all submit buttons need to be 240px wide, add to theme:
// Button: Button.extend({ defaultProps: { w: 240 } })
<Button>Submit</Button>  // Will be 240px wide everywhere

// 3. Context-specific overrides (with documentation):
// 3a. Component props (when available)
<Button mt="xl" w={240}> // Extra margin for form spacing
    Submit
</Button>

// 3b. CSS modules (when props unavailable or complex styling)
<Card className={styles.interactiveCard}/>  // Complex hover effects
```

### When to Override Styles

Only override styles when there's a clear contextual need:

1. **Ask first**: Can I achieve this with theme defaults by extending the theme?
2. **Check frequency**: Is this override used multiple times? → Theme extension
3. **Use component inline-style props**: When available for the properties you need and the override is simple (1-3 props) .eg `mt={20} w={180} c="green"`
4. **Use CSS modules**: When component inline-style props aren't available or more than 3 props are needed
5. **Document why**: Always explain the contextual reason for overrides

**❌ NEVER use:**

-   `styles` prop (always use CSS modules instead)
-   `sx` prop (it's a v6 prop)
-   `style` prop (inline styles)

### 1. Theme Extensions (For Repeated Patterns)

If you find yourself applying the same style override multiple times, add it to the theme in mantine8Theme.ts:

```tsx
// In src/mantine8Theme.ts - inside the components object
components: {
    Button: Button.extend({
        styles: {
            root: {
                // Common button customization used across the app
                minWidth: '120px',
                fontWeight: 600,
            }
        }
    }),
    // ... other components
}
```

### 2. Context-Specific Overrides

When you need to override styles for a specific context with clear motivation:

#### Inline-style Component Props (for simple overrides)

For simple overrides (1-3 props), use inline-style component props when available. Check Mantine docs/TypeScript for available props.
When hitting more than 3 props, use CSS modules instead.

```tsx
// ✅ Good - Inline-style component props with clear context
<Button
    mt="xl"     // Extra space needed after error message
    w={240}     // Match form field width
    c="blue.6"  // Brand color for primary action
>
    Submit
</Button>

// ❌ Bad - Using style prop when inline-style component props exist
<Button style={{marginTop: 40, width: 240, color: 'blue'}}>Submit</Button>

// ❌ Bad - Too many inline-style component props - too complex for inline
<Button mt={20} mb={20} ml={10} mr={10} w={240} c="blue.6" bg="white">Submit</Button>
```

Common inline-style component props examples:

-   Layout: `mt`, `mb`, `ml`, `mr`, `m`, `p`, `pt`, `pb`, `pl`, `pr`
-   Sizing: `w`, `h`, `maw`, `mah`, `miw`, `mih`
-   Colors: `c` (color), `bg` (background)
-   Display: `display`, `pos` (position)
-   Font: `ff` (font family), `fs` (font size), `fw` (font weight)
-   Text: `ta` (text align), `lh` (line height)
-   Shadow: `shadow` (shadow)

#### CSS Modules (complex styles)

Use CSS modules when component props aren't available or for complex styling (when more than 3 inline-style props are needed). This file should be in the same folder as the component and share the same name but with .module.css extension.

```css
/* Component.module.css */
.customCard {
    /* Complex hover state that can't be done inline */
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

<Card className={styles.customCard}>{/* Card content */}</Card>;
```

Do not include a `<file>.css.d.ts` file for css modules. We are using Vite and don't need them.

In CSS modules, avoid using `!important` where possible. It's better to use the `classNames` API for increased specificity.

### 3. Important Guidelines

#### Remove Dead Styles

Before moving styles to CSS modules, analyze if they're actually needed:

```tsx
// Example: Button inside a Flex container
<Flex justify="flex-end">
    <Button style={{display: 'block'}}>Submit</Button>
</Flex>

// ✅ Better: Remove the style entirely
// display: block has no effect on flex children - they're flex items regardless
<Flex justify="flex-end">
    <Button>Submit</Button>
</Flex>
```

**When to remove styles entirely:**

-   The style has no visual effect in its context
-   It's overridden by parent layout (e.g., flex/grid children)
-   It's redundant with the theme
-   It's legacy code from previous v6 implementations

**Always verify:** Test the component with and without the style to confirm it has no effect before removing.

#### Always Use Theme Tokens

```tsx
// ❌ Bad - Magic numbers
<Box p={16} mt={24}>

// ✅ Good - Theme tokens
<Box p="md" mt="lg">
```

## Mantine Documentation

**IMPORTANT**: Always check component documentation or TypeScript types to see available props before using inline
styles.

Component props and APIs can be found in the official docs:

-   **Pattern**: `https://mantine.dev/core/[component-name]/`
-   **Examples**:
    -   Select: https://mantine.dev/core/select/
    -   SegmentedControl: https://mantine.dev/core/segmented-control/
    -   SemiCircleProgress: https://mantine.dev/core/semi-circle-progress/

**Tip**: In your IDE, hover over a component or use Go to Definition to see all available props in the TypeScript interface.
