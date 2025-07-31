## 🎨 Frontend Style Guide

**CRITICAL**: Before working on any frontend component, read
the [Frontend Style Guide](STYLE_GUIDE.md). Key points:

- **Use Mantine v8 only** - Migrate any Mantine v6 components you encounter
- **Provider setup required** - Wrap v8 components with `MantineProvider` using `getMantine8ThemeOverride()`
- **Styling hierarchy**: 
  1. Component props (≤3 simple layout props like `mt`, `p`, `w`)
  2. CSS modules (default choice)
  3. Theme extensions for reusable styles
- **NEVER use** `styles` or `sx` props
- **Prop changes** - `spacing` → `gap`, `noWrap` → `wrap="nowrap"`, `sx` → `style`
- **Component docs** - Props/APIs at `https://mantine.dev/core/[component-name]/` (e.g. select, segmented-control)
