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
        <Button style={{marginTop: 20}}>Click</Button>
    </Group>
</MantineProvider>
```

### Key Prop Changes

- `spacing` → `gap`
- `noWrap` → `wrap="nowrap"`
- `sx` → Use component props or `style` (see styling hierarchy below)
- Style props: `mt`, `mb`, `mr`, `ml`, `p`, `w`, `h`, `c`, `bg`, etc. are available on most Mantine components

### Component Props vs Inline Styles

**IMPORTANT**: Always prefer Mantine component props over the `style` prop:

```tsx
// ❌ Bad - Using style prop when component props are available
<Button style={{marginTop: 20, width: 180, color: 'green'}}>Submit</Button>
<MantineIcon style={{color: 'green', display: 'block'}} />

// ✅ Good - Using component props
<Button mt={20} w={180} c="green">Submit</Button>
<MantineIcon color="green.6" display="block" />
```

When migrating from v6 and component props aren't available, add TODO comments:

```tsx
// TODO: Move inline styles to theme extension
<CustomComponent style={{marginTop: 20}}>Content</CustomComponent>
```

## Styling Best Practices

### Mantine 8 Styling Hierarchy

For Mantine v8 components, follow this order of preference:

1. **Component Props** - ALWAYS prefer these when available (check Mantine docs)
2. **CSS Modules** - For complex styling or when component props aren't available
3. **Theme Extensions** - For reusable component styles across the app
4. **Inline `style` prop** - Only when necessary for layout with ≤3 properties

**❌ NEVER use:**
- `styles` prop 
- `sx` prop

### 1. Component Props (Always First Choice)

**ALWAYS check if a Mantine component has a prop for what you need before using inline styles.** Common props include:
- Layout: `mt`, `mb`, `ml`, `mr`, `m`, `p`, `pt`, `pb`, `pl`, `pr`
- Sizing: `w`, `h`, `maw`, `mah`, `miw`, `mih`
- Colors: `c` (color), `bg` (background)
- Display: `display`, `pos` (position)
- And many more component-specific props

```tsx
// ✅ Good - Using available component props
<Button mt="md" w={180} c="blue">Submit</Button>
<MantineIcon color="green.6" size="lg" />
<Box p="xs" mb="lg" display="flex">Content</Box>

// ❌ Bad - Using style prop when component props exist
<Button style={{marginTop: 'var(--mantine-spacing-md)', width: 180}}>Submit</Button>
<MantineIcon style={{color: 'green'}} />
```

**Note**: Layout props are often needed and allowed. There's no strict limit of 3 props - use as many component props as needed.

### 2. CSS Modules (For Complex Styling)

Use CSS modules when component props aren't sufficient or for complex styling:

```css
/* Component.module.css */
.submitButton {
    background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
    border-radius: var(--mantine-radius-md);
    width: 180px;
}
```

```tsx
import styles from './Component.module.css';

<Button className={styles.submitButton}>Custom</Button>
```

### 3. Theme Extensions (For Reusable Styles)

Add reusable component styles to `src/mantine8Theme.ts`:

```tsx
Select: Select.extend({
    defaultProps: {
        radius: 'md',
    },
    styles: (theme) => ({
        input: {
            maxWidth: 200, // Add common widths here
        },
    }),
}),
```

### 4. Inline Style Prop (Last Resort)

Use the `style` prop only when:
- Component props aren't available for what you need
- You need temporary/dynamic styling
- Layout adjustments with ≤3 properties

```tsx
// ✅ Acceptable - No display prop available on this component
<CustomComponent style={{ display: 'flex' }} />

// ✅ Acceptable - Dynamic/calculated values
<Box style={{ width: `${calculatedWidth}px` }} />

// ❌ Bad - Component props are available
<Button style={{ marginTop: 20, color: 'blue' }}>Click</Button>
```

### 5. Never Use Magic Numbers

```tsx
// ❌ Bad
<Box p={16}>

// ✅ Good  
<Box p="md">
```

Use Mantine's theme tokens instead of hard-coded values.

## Mantine Documentation

**IMPORTANT**: Always check component documentation or TypeScript types to see available props before using inline styles.

Component props and APIs can be found in the official docs:
- **Pattern**: `https://mantine.dev/core/[component-name]/`
- **Examples**: 
  - Select: https://mantine.dev/core/select/
  - SegmentedControl: https://mantine.dev/core/segmented-control/
  - SemiCircleProgress: https://mantine.dev/core/semi-circle-progress/

**Tip**: In your IDE, hover over a component or use Go to Definition to see all available props in the TypeScript interface.

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