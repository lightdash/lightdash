## 🎨 Frontend Style Guide

**CRITICAL**: Before working on any frontend component, read
the [Frontend Style Guide](STYLE_GUIDE.md). Key points:

- **Use Mantine v8 only** - Migrate any Mantine v6 components you encounter
- **Provider setup required** - Wrap v8 components with `MantineProvider` using `getMantine8ThemeOverride()`
- **Theme extensions** - Add styles to `packages/frontend/src/mantine8Theme.ts`
- **CSS modules** - Use for one-off style overrides following Mantine 8 best practices
- **Prop changes** - `spacing` → `gap`, `noWrap` → `wrap="nowrap"`, `sx` → `style`
- **Component docs** - Props/APIs at `https://mantine.dev/core/[component-name]/` (e.g. select, segmented-control)
