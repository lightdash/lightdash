/**
 * Mirror of the data-app SDK's capability registry
 * (`packages/query-sdk/src/features.ts`). The SDK copy is the source of truth
 * — it lives beside the runtime it describes and its drift test — but the
 * Lightdash frontend/backend build from common, and the deployment images do
 * not include the query-sdk workspace package. A sync test in query-sdk
 * (`features.test.ts`) fails CI when the two copies diverge. Same pattern as
 * the dual dbt-YAML schemas.
 */

import { DATA_APP_VIZ_TEMPLATE, type DataAppTemplate } from './types';

/**
 * Which kind of bundle a capability is meaningful for. Every bundle on a
 * given SDK version reports the whole registry, so the host uses this to
 * offer only what the app kind can use: a chart type never runs queries or
 * exports to Sheets, an app never receives a viz context.
 */
export type SdkFeatureTarget = 'data_app' | 'chart_type';

export const SDK_FEATURE_TARGETS: SdkFeatureTarget[] = [
    'data_app',
    'chart_type',
];

export type SdkFeature = {
    key: string;
    label: string;
    description: string;
    /** Non-empty; features used by both kinds list both targets. */
    appliesTo: SdkFeatureTarget[];
    /** Agent-facing note on the app-code wiring the feature needs before the
     *  host can use it (absent = zero wiring; it activates automatically once
     *  the bundle runs on a current SDK). Never rendered in user-facing UI. */
    wiring?: string;
};

/** Mirrors the SdkFix shape from @lightdash/query-sdk/features. */
export type SdkFix = {
    key: string;
    label: string;
    description: string;
    /** Non-empty; fixes used by both kinds list both targets. */
    appliesTo: SdkFeatureTarget[];
};

export const SDK_FEATURES: SdkFeature[] = [
    {
        key: 'query',
        appliesTo: ['data_app'],
        label: 'Semantic layer queries',
        description:
            'Run metric and dimension queries against the Lightdash semantic layer.',
    },
    {
        key: 'metric-filters',
        appliesTo: ['data_app'],
        label: 'Metric filters',
        description:
            'Filter grouped query results by metric values, including metrics used only as filters.',
        wiring: 'Pass metric filter rules to query(...).metricFilters([...]); keep dimension filter rules in .filters([...]).',
    },
    {
        key: 'saved-chart',
        appliesTo: ['data_app'],
        label: 'Saved chart queries',
        description:
            'Fetch results from existing saved charts instead of ad-hoc queries.',
    },
    {
        key: 'drill-down',
        appliesTo: ['data_app'],
        label: 'Drill-down helper',
        description:
            'Derive drill-down queries from a clicked result row to build explore-style interactions.',
    },
    {
        key: 'inspect',
        appliesTo: ['data_app', 'chart_type'],
        label: 'Element picker',
        description:
            'Lets the Lightdash editor highlight and select app elements to reference them in prompts.',
    },
    {
        key: 'lineage',
        appliesTo: ['data_app'],
        label: 'Inspect data',
        description:
            'Click any chart to trace it back to the query and fields behind it, from the Inspect data button in the editor.',
        wiring: "Spread the `lineage` props returned by useLightdash onto each query-bound block's root element; without these stamps the host's Inspect data button stays disabled.",
    },
    {
        key: 'screenshot',
        appliesTo: ['data_app', 'chart_type'],
        label: 'In-app screenshots',
        description:
            'Lets the host rasterize the app to an image for thumbnails and scheduled deliveries.',
    },
    {
        key: 'external-fetch',
        appliesTo: ['data_app'],
        label: 'External data fetch',
        description:
            'Fetch approved external HTTP data sources through the Lightdash proxy.',
    },
    {
        key: 'gsheet-export',
        appliesTo: ['data_app'],
        label: 'Google Sheets export',
        description:
            'Export tabular results from the app straight to Google Sheets.',
    },
    {
        key: 'url-state',
        appliesTo: ['data_app'],
        label: 'Shareable URL state',
        description:
            'Sync in-app state to the page URL so app views can be shared and restored.',
    },
    {
        key: 'viz-context',
        appliesTo: ['chart_type'],
        label: 'Dashboard visualization context',
        description:
            'Receive query context when app visualizations are embedded in dashboards.',
    },
    {
        key: 'viz-rendered',
        appliesTo: ['chart_type'],
        label: 'Custom chart captures',
        description:
            'Capture custom charts after their initial render, preventing blank images in image exports and scheduled deliveries.',
    },
    {
        key: 'viz-multiple-fields',
        appliesTo: ['chart_type'],
        label: 'Multiple visualization fields',
        description:
            'Receive ordered mappings for reusable visualization slots that accept multiple metrics or dimensions.',
        wiring: 'Declare multiple: true for a viz schema field, then read fieldMapping[name] as an ordered array of query field ids. Existing single-field slots continue to use fieldMapping[name] as a string.',
    },
    {
        key: 'viz-config-options',
        appliesTo: ['chart_type'],
        label: 'Visualization config options',
        description:
            "Let viewers adjust the visualization from the Lightdash config panel — toggles, dropdowns, numbers, text and colours — and take series colours from the chart's palette, without regenerating the app.",
        wiring: 'Declare configOptions (and colorPalette, if the viz colours series) in the viz schema, then read options[name] and colorPalette from useVizContext().',
    },
    {
        key: 'viz-field-options',
        appliesTo: ['chart_type'],
        label: 'Per-field visualization settings',
        description:
            'Let viewers set each bound visualization field independently, such as a fixed series color or label. Offer it when one setting needs to differ between mapped fields.',
        wiring: 'Declare configOptions on a viz schema field, then read useVizContext().fieldOptions[slotName]?.[fieldId]?.[optionName] using actual ids from fieldMapping[slotName]. The map is empty on older hosts.',
    },
    {
        key: 'viz-field-gradient-colors',
        appliesTo: ['chart_type'],
        label: 'Field color gradients',
        description:
            'Color each bound numeric field with an independent two-color scale. Offer it when viewers need to compare values using fixed colors and auto or custom bounds.',
        wiring: 'Declare colorOptions.gradient on a viz schema field. Read colors with resolveFieldColor(useVizContext(), slotName, fieldId, rawValue, fallbackColor); use the actual bound field ID. The helper returns the fallback on older hosts or for values outside the scale.',
    },
    {
        key: 'viz-field-conditional-colors',
        appliesTo: ['chart_type'],
        label: 'Field color rules',
        description:
            'Color each bound numeric field with ordered conditions. Offer it when selected values or ranges need fixed colors that take priority over a gradient.',
        wiring: 'Declare colorOptions.rules on a viz schema field. Read the final color with resolveFieldColor(useVizContext(), slotName, fieldId, rawValue, fallbackColor); the host applies the last matching enabled rule before any gradient.',
    },
    {
        key: 'viz-pivoted-results',
        appliesTo: ['chart_type'],
        label: 'Pivoted results',
        description:
            'Render reusable charts and tables from backend-pivoted rows and their complete layout metadata.',
        wiring: 'When useVizContext().pivotDetails is non-null, use valuesColumns to resolve generated row keys and use indexColumn, groupByColumns, originalColumns, sortBy, totalColumnCount, and passthroughDimensions when the visualization needs their layout semantics. Keep the existing fieldMapping path when pivotDetails is null.',
    },
    {
        key: 'viz-resolved-colors',
        appliesTo: ['chart_type'],
        label: 'Consistent visualization colors',
        description:
            'Honor model-defined colors and shared dashboard color assignments in reusable visualizations.',
        wiring: 'Use resolveSeriesColor(context, column, index) for backend-pivoted series and resolveValueColor(context, fieldId, rawValue, index) for client-side groups; both helpers fall back to colorPalette.',
    },
    {
        key: 'follow-host-theme',
        appliesTo: ['data_app', 'chart_type'],
        label: 'Follow the host light/dark mode',
        description:
            "Match the light or dark mode of the viewer's Lightdash (or embed) instead of a fixed theme, and restyle live when they switch.",
        wiring: 'Keep complete light tokens in :root and dark tokens in .dark, remove any fixed dark class from the app shell, and use useColorScheme() only for colours that cannot be expressed in CSS.',
    },
    {
        key: 'delivery-render',
        appliesTo: ['data_app'],
        label: 'Full data in scheduled deliveries',
        description:
            "Scheduled deliveries and their preview render every tab or slide's data, not just the one currently visible.",
        wiring: "Gate tab/slide content so DATA components for all tabs mount when useDeliveryRender() is true — tabs switch what's shown, not what's fetched. Never mount all tabs unconditionally.",
    },
    {
        key: 'viz-underlying-data',
        appliesTo: ['chart_type'],
        label: 'View underlying data',
        description:
            'Open the raw result rows behind a clicked data point in a reusable visualization, with CSV/XLSX download.',
        wiring: 'In the viz, keep the untransformed source row on each interactive datum. On a data-point click, when useVizContext().pointMenu.enabled, call pointMenu.open({ x, y, row, metric }) and render no menu of your own; keep a local data-point action menu — shown only when useVizContext().underlyingData.enabled and the mark maps to exactly one source row, calling underlyingData.open({ row, metric }) on selection — only as the pointMenu.enabled-false fallback for older hosts. Either way, Lightdash opens the standard dialog and owns its table, loading, error, and download controls.',
    },
    {
        key: 'viz-host-underlying-data',
        appliesTo: ['chart_type'],
        label: 'View underlying data in Lightdash',
        description:
            'Open the standard Lightdash underlying-data dialog from a reusable visualization, with the table and download controls owned by Lightdash.',
        wiring: 'Replace any underlying-data dialog, table, fetch, and download UI in the viz with underlyingData.open({ row: datum.sourceRow, metric: "<field name>" }). On a data-point click, when useVizContext().pointMenu.enabled, call pointMenu.open({ x, y, row, metric }) instead and render no local menu; keep the local menu gated on underlyingData.enabled only as the pointMenu.enabled-false fallback for older hosts. Either way, Lightdash owns the dialog.',
    },
    {
        key: 'point-action-menu',
        appliesTo: ['chart_type'],
        label: 'Data point actions',
        description:
            'Native Lightdash context menu on data-point clicks — copy value, view underlying data, drill, and dashboard cross-filtering — rendered by the host. Want it whenever a chart has clickable data points.',
        wiring: "On a data-point click, when useVizContext().pointMenu.enabled, call pointMenu.open({ x: event.clientX, y: event.clientY, row: datum.sourceRow, metric: '<field name>' }) and render no menu of your own; keep a minimal local menu only as the enabled-false fallback for older hosts.",
    },
    {
        key: 'ai-insights',
        appliesTo: ['data_app'],
        label: 'AI analysis',
        description:
            "Render the host's AI analysis of the current view inside the app: an executive summary with notable changes, markers on the flagged data points, and Investigate / Continue in Ask AI actions.",
        wiring: 'Wire the template\'s shipped components from src/components/insights (InsightsSummary at the top of the page; InsightMarker as both dot and activeDot, or insightCellProps on bar Cells, on every query-bound chart; InvestigateMenuItem in every point menu; InvestigationCard under the chart). A short ask such as "add AI analysis" gets the whole set. They sit on useInsights() and render nothing when the host has no analysis.',
    },
    {
        key: 'ai-prompt',
        appliesTo: ['data_app'],
        label: 'AI prompts',
        description:
            "Ask the org-approved AI an author-written question about results the app already loaded, for example a one-line takeaway under a chart or an explanation of a clicked row. Answers are plain text; the host applies the organisation's consent and permission gates.",
        wiring: 'Call useAiPrompt() and, from a user action or once per loaded view, ask({ prompt, sources: [{ result, label }], focus: { row } }) where result is the object useLightdash returns (keep a reference to it when destructuring; a rebuilt { data, columns } has no query uuid). Render text while loading is false; hide the control when available is false.',
    },
    {
        key: 'viz-drill-down',
        appliesTo: ['chart_type'],
        label: 'Drill into data points',
        description:
            'Drill into a clicked data point in a reusable visualization — pick a dimension in Lightdash and open the drilled view in explore.',
        wiring: 'On a data-point click, when useVizContext().pointMenu.enabled, call pointMenu.open({ x, y, row, metric }) and render no menu of your own — Lightdash renders its own menu, which offers "Drill into …". Keep a "Drill into …" item in a local data-point action menu — shown only when useVizContext().drillDown.enabled and the mark maps to exactly one source row, calling drillDown.open({ row: datum.sourceRow, metric: "<field name>" }) on selection — only as the pointMenu.enabled-false fallback for older hosts. Either way, the host opens its drill dialog — render no dialog in the viz and never render a disabled item.',
    },
    {
        key: 'viz-field-metadata',
        appliesTo: ['chart_type'],
        label: 'Field names and formats',
        description:
            'Show real field labels and semantic-layer formats in reusable visualizations — axis titles, legends and default labels read "Total order amount" instead of the raw field id.',
        wiring: 'Read display names with getFieldLabel(context, fieldId) — it falls back to the raw field id on hosts that send no metadata — and build axis-tick or legend formatters from useVizContext().fields[fieldId]?.format; treat the whole fields map as possibly empty.',
    },
];

export const SDK_FEATURE_KEYS: string[] = SDK_FEATURES.map((f) => f.key);

/**
 * SDK fixes begin being tracked with the manifest's `fixes` field. Add only
 * future stable identifiers; historical SDK behavior is intentionally not
 * backfilled or inferred from versions.
 */
export const SDK_FIXES: SdkFix[] = [];

export const SDK_FIX_KEYS: string[] = SDK_FIXES.map((fix) => fix.key);

export const sdkFeatureAppliesTo = (
    feature: Pick<SdkFeature, 'appliesTo'>,
    target: SdkFeatureTarget,
): boolean => feature.appliesTo.includes(target);

/** The registry entries an upgrade may offer to a bundle of this kind. */
export const getSdkFeaturesForTarget = (
    target: SdkFeatureTarget,
): SdkFeature[] => SDK_FEATURES.filter((f) => sdkFeatureAppliesTo(f, target));

/** The SDK fixes an upgrade may offer to a bundle of this kind. */
export const getSdkFixesForTarget = (target: SdkFeatureTarget): SdkFix[] =>
    SDK_FIXES.filter((fix) => sdkFeatureAppliesTo(fix, target));

/** Custom chart types are the `data_app_viz` template; every other template
 *  (including pre-template `null`) is a data app. */
export const getSdkFeatureTargetForTemplate = (
    template: DataAppTemplate | null | undefined,
): SdkFeatureTarget =>
    template === DATA_APP_VIZ_TEMPLATE ? 'chart_type' : 'data_app';
