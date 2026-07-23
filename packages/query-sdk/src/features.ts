/**
 * Static registry of SDK capabilities, reported to the Lightdash host via the
 * `lightdash:sdk:manifest` message so the host can detect apps built on an
 * older SDK and offer an upgrade.
 *
 * Adding an SDK capability requires an entry here — features.test.ts fails if
 * a `lightdash:*:available` message exists without a matching key. Keys are
 * stable identifiers; label/description feed the host's "What's new" UI.
 */

export type SdkFeature = {
    key: string;
    label: string;
    description: string;
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
        label: 'Field lineage',
        description:
            'Reports which fields each visualization uses so the host can highlight data lineage.',
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
];

export const SDK_FEATURE_KEYS: string[] = SDK_FEATURES.map((f) => f.key);

export const SDK_MANIFEST_MESSAGE_TYPE = 'lightdash:sdk:manifest';

/**
 * Sent from the app iframe to the Lightdash host: once when the postMessage
 * transport is created, and again each time the host announces
 * `lightdash:sdk:ready` (covers either side mounting first).
 */
export type SdkManifestMessage = {
    type: typeof SDK_MANIFEST_MESSAGE_TYPE;
    sdkVersion: string;
    features: string[];
};
