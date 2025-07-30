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

### 1. Theme Extensions (Preferred)

Add reusable styles to `src/mantine8Theme.ts`:

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

### 2. CSS Modules (For One-offs)

```css
/* Component.module.css */
.customButton {
    background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
}
```

```tsx
import styles from './Component.module.css';

<Button className={styles.customButton}>Custom</Button>
```

### 3. Never Use Magic Numbers

```tsx
// ❌ Bad
<Box style={{padding: 16}}>

    // ✅ Good
    <Box style={{padding: 'var(--mantine-spacing-md)'}}>
```

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