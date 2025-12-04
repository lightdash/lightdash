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
-   [ ] Theme values('md', 'lg', 'xl', or 'ldGray.1', 'ldGray.2', 'ldDark.1', 'ldDark.2', etc) instead of magic numbers

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

#### Color Guidelines

**Prefer default component colors - Mantine handles theme switching automatically:**

```tsx
// ✅ Best - Let Mantine handle theme switching
<Button>Default button</Button>           // Auto-switches themes
<Card>Default card</Card>                 // Auto-switches themes
<Text>Default text</Text>                 // Auto-switches themes
<TextInput placeholder="Search..." />     // Auto-switches themes
```

**When you need custom colors, use theme colors for dark mode compatibility:**

```tsx
// ❌ Bad - Standard Mantine colors (poor dark mode support)
<Text c="gray.6">Secondary text</Text>
<Box bg="gray.1">Background</Box>

// ✅ Good - ldGray for borders and neutral elements
<Text c="ldGray.6">Secondary text</Text>        // Gray text → Light gray text
<Box style={{ borderColor: 'ldGray.3' }}>Border</Box>  // Auto-adjusts border

// ✅ Good - ldDark for elements that appear dark in light mode
<Button bg="ldDark.8" c="ldDark.0">Dark button</Button>  // Dark bg/light text → Light bg/dark text
<Badge bg="ldDark.9" c="ldDark.1">Dark badge</Badge>    // Inverts for dark mode

// ✅ Good - Foreground/background variables
<Text c="foreground">Primary text</Text>      // Main text color
<Box bg="background">Main background</Box>    // Main background color
```

**Available custom color scales:**

| Token | Light Mode | Dark Mode | Purpose |
|-------|------------|-----------|---------|
| `ldGray.0-9` | Light grays (#f8f9fa → #212529) | Dark grays (#2e2e32 → #d9d9df) | Borders, text |
| `ldDark.0-9` | Dark shades (#C9C9C9 → #141414) | Light shades (#f3f5ff → #18181a) | Inverted contrast elements |
| `background` | #FEFEFE (white) | #1A1B1E (dark) | Page/card backgrounds |
| `foreground` | #1A1B1E (dark) | #FEFEFE (white) | Primary text color |

**When to use each:**
- **`ldGray`**: Borders, subtle text, neutral UI elements
- **`ldDark`**: Buttons/badges with dark backgrounds in light mode, "inverted" elements
- **`foreground`**: Main text color throughout the app
- **`background`**: Main page/container backgrounds
- **Standard colors**: Brand colors (blue, red, green) for accents and semantic meanings

#### Advanced Theme Customization

**For complex theme-specific styling, use CSS modules with mixins:**

```css
/* Component.module.css */
.customCard {
    border-radius: 8px;
    padding: 1rem;
    transition: all 0.2s ease;
}

/* Light theme specific styles */
@mixin light {
    .customCard {
        background-color: #ffffff;
        border: 1px solid #e0e0e0;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .customCard:hover {
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }
}

/* Dark theme specific styles */
@mixin dark {
    .customCard {
        background-color: #1a1a1a;
        border: 1px solid #404040;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }

    .customCard:hover {
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
        background-color: #252525;
    }
}

/* Theme-specific icons or complex layouts */
@mixin light {
    .iconWrapper {
        background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
    }
}

@mixin dark {
    .iconWrapper {
        background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
    }
}
```

**When to use CSS modules mixins:**
- Complex hover states that differ between themes
- Gradients or shadows that need theme-specific values
- Layout adjustments based on theme
- When component props don't provide enough customization

#### Theme-Aware Component Logic

**For JavaScript logic that needs to know the current theme:**

```tsx
import { useMantineColorScheme } from '@mantine/core';

const MyComponent = () => {
    const { colorScheme } = useMantineColorScheme();

    // Theme-specific logic
    const iconColor = colorScheme === 'dark' ? 'blue.4' : 'blue.6';
    const showBorder = colorScheme === 'light';

    return (
        <Box style={{ border: showBorder ? '1px solid' : 'none' }}>
            <Icon color={iconColor} />
        </Box>
    );
};
```

**When to use `useMantineColorScheme()`:**
- Conditional rendering based on theme
- Dynamic prop values that can't be handled by CSS
- Component behavior that changes between themes

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
