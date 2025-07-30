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
- `sx` → `style`
- `mt`, `mb`, `mr`, `ml` → `style={{ marginTop: X }}`

### Inline Styles

When migrating, add TODO comments for any inline styles:

```tsx
// TODO: Move inline styles to theme extension
<Button style={{marginTop: 20, width: 180}}>Submit</Button>
```

## Styling Best Practices

### Mantine 8 Styling Hierarchy

For Mantine v8 components, follow this order of preference:

1. **Component Props (≤3 simple layout props)** - Use for basic layout properties like margin, padding, width
2. **CSS Modules** - Default choice for styling
3. **Theme Extensions** - For reusable component styles across the app

**❌ NEVER use:**
- `styles` prop 
- `sx` prop

### 1. Component Props (Maximum 3 Simple Props)

Use built-in component props only for basic layout properties:

```tsx
// ✅ Good - Simple layout props (≤3)
<Button mt="md" w={180}>Submit</Button>
<Box p="xs" mb="lg">Content</Box>

// ❌ Bad - Too many props or complex styling
<Button mt="md" w={180} bg="red" c="white">Submit</Button>
<Button styles={{root: {background: 'red'}}}>Submit</Button>
```

### 2. CSS Modules (Default Choice)

Use CSS modules for any styling beyond simple component props:

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

### 4. Never Use Magic Numbers

```tsx
// ❌ Bad
<Box p={16}>

// ✅ Good  
<Box p="md">
```

Use Mantine's theme tokens instead of hard-coded values.

## Mantine Documentation

Component props and APIs can be found in the official docs:
- **Pattern**: `https://mantine.dev/core/[component-name]/`
- **Examples**: 
  - Select: https://mantine.dev/core/select/
  - SegmentedControl: https://mantine.dev/core/segmented-control/
  - SemiCircleProgress: https://mantine.dev/core/semi-circle-progress/

## Component Checklist

When creating/updating components:

- [ ] Uses `@mantine-8/core` imports
- [ ] Wrapped with `MantineProvider` + `getMantine8ThemeOverride()`
- [ ] No Mantine 6 syntax
- [ ] TODO comments on inline styles
- [ ] Theme values instead of magic numbers
- [ ] TypeScript interfaces are explicit (no duck typing)