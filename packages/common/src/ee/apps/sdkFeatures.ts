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
        key: 'metric-filters',
        label: 'Metric filters',
        description:
            'Filter grouped query results by metric values, including metrics used only as filters.',
        wiring: 'Pass metric filter rules to query(...).metricFilters([...]); keep dimension filter rules in .filters([...]).',
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
    {
        key: 'viz-pivoted-results',
        label: 'Pivoted results',
        description:
            'Render reusable charts and tables from backend-pivoted rows and their complete layout metadata.',
        wiring: 'When useVizContext().pivotDetails is non-null, use valuesColumns to resolve generated row keys and use indexColumn, groupByColumns, originalColumns, sortBy, totalColumnCount, and passthroughDimensions when the visualization needs their layout semantics. Keep the existing fieldMapping path when pivotDetails is null.',
    },
    {
        key: 'follow-host-theme',
        label: 'Follow the host light/dark mode',
        description:
            "Match the light or dark mode of the viewer's Lightdash (or embed) instead of a fixed theme, and restyle live when they switch.",
        wiring: 'Keep complete light tokens in :root and dark tokens in .dark, remove any fixed dark class from the app shell, and use useColorScheme() only for colours that cannot be expressed in CSS.',
    },
    {
        key: 'delivery-render',
        label: 'Full data in scheduled deliveries',
        description:
            "Scheduled deliveries and their preview render every tab or slide's data, not just the one currently visible.",
        wiring: "Gate tab/slide content so DATA components for all tabs mount when useDeliveryRender() is true — tabs switch what's shown, not what's fetched. Never mount all tabs unconditionally.",
    },
    {
        key: 'viz-underlying-data',
        label: 'View underlying data',
        description:
            'Open the raw result rows behind a clicked data point in a reusable visualization, with CSV/XLSX download.',
        wiring: 'In the viz, keep the untransformed source row on each interactive datum, show a data-point action menu only when useVizContext().underlyingData.enabled and the mark maps to exactly one source row, render underlyingData.get({ row, metric }) in a themed dialog, and wire its Download button to underlyingData.download.',
    },
];

export const SDK_FEATURE_KEYS: string[] = SDK_FEATURES.map((f) => f.key);
