# Lightdash Frontend Style Guide

## Mantine 8 Migration

**CRITICAL**: We are migrating from Mantine 6 to 8. Always upgrade v6 components when you encounter them.

### Quick Migration Guide

```tsx
// ❌ Mantine 6
import { Button, Group } from '@mantine/core';

<Group spacing="xs" noWrap>
    <Button sx={{mt: 20}}>Click</Button>
</Group>

// ✅ Mantine 8
import { Button, Group, MantineProvider } from '@mantine-8/core';
import { getMantine8ThemeOverride } from '../../../mantine8Theme';

<MantineProvider theme={getMantine8ThemeOverride()}>
    <Group gap="xs" wrap="nowrap">
        <Button mt={20}>Click</Button>
    </Group>
</MantineProvider>
```

### Key Prop Changes

- `spacing` → `gap`
- `noWrap` → `wrap="nowrap"`
- `sx` → Component props (e.g., `mt`, `w`, `c`) or CSS modules
- Style props now available: `mt`, `mb`, `mr`, `ml`, `p`, `w`, `h`, `c`, `bg`, etc.

### Component Props vs Inline Styles

**IMPORTANT**: Always prefer Mantine component props over the `style` prop:

```tsx
// ❌ Bad - Using style prop when component props are available
<Button style={{marginTop: 20, width: 180, color: 'green'}}>Submit</Button>
<MantineIcon style={{color: 'green', display: 'block'}}/>

// ✅ Good - Using component props
<Button mt={20} w={180} c="green">Submit</Button>
<MantineIcon color="green.6" display="block"/>
```

When migrating from v6 and component props aren't available, use CSS modules:

```css
/* styles.module.css */
.customComponent {
    margin-top: 20px;
}
```

```tsx
import styles from './styles.module.css';

<CustomComponent className={styles.customComponent}>Content</CustomComponent>
```

## Styling Best Practices

### Core Principle: Theme First

**The goal is to use theme defaults whenever possible.** Style overrides should be the exception, not the rule.

### Quick Reference

```tsx
// 1. Best: No custom styles (use theme defaults)
<Button>Submit</Button>

// 2. Theme extension (for repeated patterns)
// Add to mantine8Theme.ts if using the same override multiple times

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

1. **Ask first**: Can I achieve this with theme defaults?
2. **Check frequency**: Is this override used multiple times? → Theme extension
3. **Use component props**: When available for the properties you need
4. **Use CSS modules**: When component props aren't available
5. **Document why**: Always explain the contextual reason for overrides

**❌ NEVER use:**
- `styles` prop
- `sx` prop
- `style` prop (inline styles)

### 1. Theme Extensions (For Repeated Patterns)

If you find yourself applying the same style override multiple times, add it to the theme:

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

#### Component Props (Always First Choice)

Use component props when available. Check Mantine docs/TypeScript for available props:

```tsx
// ✅ Good - Component props with clear context
<Button
    mt="xl"     // Extra space needed after error message
    w={240}     // Match form field width
    c="blue.6"  // Brand color for primary action
>
    Submit
</Button>

// ❌ Bad - Using style prop when component props exist
<Button style={{marginTop: 40, width: 240, color: 'blue'}}>Submit</Button>
```

Common component props:

- Layout: `mt`, `mb`, `ml`, `mr`, `m`, `p`, `pt`, `pb`, `pl`, `pr`
- Sizing: `w`, `h`, `maw`, `mah`, `miw`, `mih`
- Colors: `c` (color), `bg` (background)
- Display: `display`, `pos` (position)


#### CSS Modules (When Component Props Aren't Available)

Use CSS modules when component props aren't available or for complex styling:

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

<Card className={styles.customCard}>
    {/* Card content */}
</Card>
```

### 3. Important Guidelines

#### Always Use Theme Tokens

```tsx
// ❌ Bad - Magic numbers
<Box p={16} mt={24}>

// ✅ Good - Theme tokens
<Box p="md" mt="lg">
```

#### Document Style Overrides

Always explain WHY you're overriding default styles:

```tsx
// ✅ Good
<Button 
    w="100%"  // Full width needed in mobile view
    mt="xl"   // Extra spacing after error messages
>

// ❌ Bad - No context
<Button w="100%" mt="xl">
```

## Mantine Documentation

**IMPORTANT**: Always check component documentation or TypeScript types to see available props before using inline
styles.

Component props and APIs can be found in the official docs:

- **Pattern**: `https://mantine.dev/core/[component-name]/`
- **Examples**:
    - Select: https://mantine.dev/core/select/
    - SegmentedControl: https://mantine.dev/core/segmented-control/
    - SemiCircleProgress: https://mantine.dev/core/semi-circle-progress/

**Tip**: In your IDE, hover over a component or use Go to Definition to see all available props in the TypeScript
interface.

## Component Checklist

When creating/updating components:

- [ ] Uses `@mantine-8/core` imports
- [ ] Wrapped with `MantineProvider` + `getMantine8ThemeOverride()`
- [ ] No Mantine 6 syntax
- [ ] Checked Mantine docs/types for available component props before using `style`
- [ ] Using component props instead of inline styles where available
- [ ] TODO comments on inline styles when component props aren't available
- [ ] Theme values instead of magic numbers
- [ ] TypeScript interfaces are explicit (no duck typing)