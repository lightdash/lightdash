## 🎨 Frontend Style Guide

**CRITICAL**: Before working on any frontend component, read
the [Frontend Style Guide](STYLE_GUIDE.md). Key points:

-   **Use Mantine v8 only** - Migrate any Mantine v6 components you encounter
-   **Styling hierarchy**:
    1. Inline-style component props (≤3 simple layout props like `mt`, `p`, `w`)
    2. CSS modules (default choice when more than 3 inline-style props are needed or when component props aren't available)
    3. Theme extensions for reusable styles
-   **NEVER use** `styles`(v8) or `sx`(v6) props or `style`(v6/v8)
-   **Colors**: Prefer default component colors (auto-theme switching). For custom colors, use `ldGray.X` and `ldDark.X`, not standard `gray.X`
-   **Prop changes** - `spacing` → `gap`, `noWrap` → `wrap="nowrap"`, `sx` → `style` (v6)
-   **Component docs** - Props/APIs at `https://mantine.dev/core/[component-name]/` (e.g. select, segmented-control)
