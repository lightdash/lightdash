export const QUERY_SDK_PACKAGE = '@lightdash/query-sdk';

// Copy of the template's `scripts` — the stored/served package.json always
// carries these instead of the uploader's, so `pnpm build` never runs an
// uploader-controlled command (drift-guarded like TEMPLATE_DEPENDENCIES).
export const TEMPLATE_SCRIPTS: Record<string, string> = {
    dev: 'vite',
    build: 'vite build',
    preview: 'vite preview',
};

// Copy of sandboxes/data-apps/template/package.json `dependencies` — the
// baseline against which uploaded dependency sets are diffed. The template is
// not shipped in production backend builds, so it is checked in here;
// templateDependencies.test.ts asserts this stays in sync with the template.
export const TEMPLATE_DEPENDENCIES: Record<string, string> = {
    '@lightdash/query-sdk': 'workspace:*',
    '@radix-ui/react-dialog': '1.1.15',
    '@radix-ui/react-label': '2.1.8',
    '@radix-ui/react-popover': '1.1.15',
    '@radix-ui/react-select': '2.2.6',
    '@radix-ui/react-separator': '1.1.8',
    '@radix-ui/react-slot': '1.2.4',
    '@radix-ui/react-tabs': '1.1.13',
    '@radix-ui/react-tooltip': '1.2.8',
    '@tanstack/react-query': '5.64.2',
    '@tanstack/react-table': '8.21.3',
    '@tanstack/react-virtual': '3.13.23',
    'class-variance-authority': '0.7.1',
    clsx: '2.1.1',
    d3: '7.9.0',
    'd3-cloud': '1.2.9',
    'd3-sankey': '0.12.3',
    'date-fns': '3.6.0',
    'html-to-image': '1.11.13',
    jspdf: '4.2.1',
    'lodash-es': '4.18.1',
    'lucide-react': '0.469.0',
    react: '19.2.5',
    'react-dom': '19.2.5',
    'react-resizable-panels': '4.10.0',
    recharts: '2.15.3',
    'tailwind-merge': '3.5.0',
    'tailwindcss-animate': '1.0.7',
};

/**
 * Baseline for validating an uploaded dependency set. `@lightdash/query-sdk`
 * is always treated as template — the CLI pins its version per release, so the
 * declared spec is mirrored into the baseline and never counts as custom.
 */
export const buildTemplateBaseline = (
    packageJson: string,
): Record<string, string> => {
    let declaredSdkSpec: string | undefined;
    try {
        const parsed = JSON.parse(packageJson) as {
            dependencies?: Record<string, unknown>;
        };
        const spec = parsed.dependencies?.[QUERY_SDK_PACKAGE];
        if (typeof spec === 'string') declaredSdkSpec = spec;
    } catch {
        // Unparseable packageJson — validateDataAppDependencies reports it.
    }
    return {
        ...TEMPLATE_DEPENDENCIES,
        ...(declaredSdkSpec !== undefined
            ? { [QUERY_SDK_PACKAGE]: declaredSdkSpec }
            : {}),
    };
};
