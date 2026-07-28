/**
 * Mirror of the data-app SDK's capability registry
 * (`packages/query-sdk/src/features.ts`). The SDK copy is the source of truth
 * — it lives beside the runtime it describes and its drift test — but the
 * Lightdash frontend/backend build from common, and the deployment images do
 * not include the query-sdk workspace package. A sync test in query-sdk
 * (`features.test.ts`) fails CI when the two copies diverge. Same pattern as
 * the dual dbt-YAML schemas.
 */

export type SdkFeature = {
    key: string;
    label: string;
    description: string;
    /** Agent-facing note on the app-code wiring the feature needs before the
     *  host can use it (absent = zero wiring; it activates automatically once
     *  the bundle runs on a current SDK). Never rendered in user-facing UI. */
    wiring?: string;
};

export const SDK_FEATURES: SdkFeature[] = [
    {
        key: 'query',
        label: 'Semantic layer queries',
        description:
            'Run metric and dimension queries against the Lightdash semantic layer.',
    },
    {
        key: 'saved-chart',
        label: 'Saved chart queries',
        description:
            'Fetch results from existing saved charts instead of ad-hoc queries.',
    },
    {
        key: 'drill-down',
        label: 'Drill-down helper',
        description:
            'Derive drill-down queries from a clicked result row to build explore-style interactions.',
    },
    {
        key: 'inspect',
        label: 'Element inspection',
        description:
            'Lets the Lightdash editor highlight and select app elements to reference them in prompts.',
    },
    {
        key: 'lineage',
        label: 'Inspect data',
        description:
            'Click any chart to trace it back to the query and fields behind it, from the Inspect data button in the editor.',
        wiring: "Spread the `lineage` props returned by useLightdash onto each query-bound block's root element; without these stamps the host's Inspect data button stays disabled.",
    },
    {
        key: 'screenshot',
        label: 'In-app screenshots',
        description:
            'Lets the host rasterize the app to an image for thumbnails and scheduled deliveries.',
    },
    {
        key: 'external-fetch',
        label: 'External data fetch',
        description:
            'Fetch approved external HTTP data sources through the Lightdash proxy.',
    },
    {
        key: 'gsheet-export',
        label: 'Google Sheets export',
        description:
            'Export tabular results from the app straight to Google Sheets.',
    },
    {
        key: 'url-state',
        label: 'Shareable URL state',
        description:
            'Sync in-app state to the page URL so app views can be shared and restored.',
    },
    {
        key: 'viz-context',
        label: 'Dashboard visualization context',
        description:
            'Receive query context when app visualizations are embedded in dashboards.',
    },
    {
        key: 'viz-config-options',
        label: 'Visualization config options',
        description:
            "Let viewers adjust the visualization from the Lightdash config panel — toggles, dropdowns, numbers, text and colours — and take series colours from the chart's palette, without regenerating the app.",
        wiring: 'Declare configOptions (and colorPalette, if the viz colours series) in the viz schema, then read options[name] and colorPalette from useVizContext().',
    },
];

export const SDK_FEATURE_KEYS: string[] = SDK_FEATURES.map((f) => f.key);
