import {
    DimensionType,
    FilterOperator,
    MetricType,
    type ApiSourceMetricAggregation,
} from '@lightdash/common';
import type {
    LiveDimensionDefinition,
    LiveExploreDefinition,
    LiveMetricDefinition,
} from '../../explores/definition';

export const GOOGLE_PLAY_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
];

export const GOOGLE_PLAY_EQUALS_FILTERS = [FilterOperator.EQUALS];

export const GOOGLE_PLAY_METRIC_SET_NAMES = [
    'crashRateMetricSet',
    'anrRateMetricSet',
    'slowStartRateMetricSet',
    'excessiveWakeupRateMetricSet',
    'stuckBackgroundWakelockRateMetricSet',
    'lmkRateMetricSet',
    'errorCountMetricSet',
] as const;

export type GooglePlayMetricSet = (typeof GOOGLE_PLAY_METRIC_SET_NAMES)[number];

type DeviceDimension = {
    apiName: string;
    name: string;
    label: string;
    description: string;
    type?: DimensionType;
};

const DEVICE_DIMENSIONS: DeviceDimension[] = [
    {
        apiName: 'versionCode',
        name: 'version_code',
        label: 'Version code',
        description:
            "The version of the app that was running on the user's device.",
        type: DimensionType.NUMBER,
    },
    {
        apiName: 'countryCode',
        name: 'country_code',
        label: 'Country',
        description:
            "Two-letter ISO-3166 code of the device's country or region, from its IP address.",
    },
    {
        apiName: 'apiLevel',
        name: 'api_level',
        label: 'Android API level',
        description:
            "The API level of Android that was running on the user's device, such as 26.",
    },
    {
        apiName: 'deviceModel',
        name: 'device_model',
        label: 'Device model',
        description: 'Device brand and name, such as google/coral.',
    },
    {
        apiName: 'deviceBrand',
        name: 'device_brand',
        label: 'Device brand',
        description: 'Device brand, such as google.',
    },
    {
        apiName: 'deviceType',
        name: 'device_type',
        label: 'Device type',
        description: 'Form factor of the device, such as PHONE.',
    },
    {
        apiName: 'deviceRamBucket',
        name: 'device_ram_bucket',
        label: 'Device RAM bucket',
        description:
            'RAM of the device in MB, in buckets: 1024 is 1 to 1.5 GB, 4096 is 4 to 6 GB.',
        type: DimensionType.NUMBER,
    },
    {
        apiName: 'deviceSocMake',
        name: 'device_soc_make',
        label: 'SoC make',
        description: "Make of the device's system on a chip.",
    },
    {
        apiName: 'deviceSocModel',
        name: 'device_soc_model',
        label: 'SoC model',
        description: "Model of the device's system on a chip.",
    },
    {
        apiName: 'deviceCpuMake',
        name: 'device_cpu_make',
        label: 'CPU make',
        description: "Make of the device's CPU.",
    },
    {
        apiName: 'deviceCpuModel',
        name: 'device_cpu_model',
        label: 'CPU model',
        description: "Model of the device's CPU.",
    },
    {
        apiName: 'deviceGpuMake',
        name: 'device_gpu_make',
        label: 'GPU make',
        description: "Make of the device's GPU.",
    },
    {
        apiName: 'deviceGpuModel',
        name: 'device_gpu_model',
        label: 'GPU model',
        description: "Model of the device's GPU.",
    },
    {
        apiName: 'deviceGpuVersion',
        name: 'device_gpu_version',
        label: 'GPU version',
        description: "Version of the device's GPU.",
    },
    {
        apiName: 'deviceVulkanVersion',
        name: 'device_vulkan_version',
        label: 'Vulkan version',
        description: 'Vulkan version the device supports.',
    },
    {
        apiName: 'deviceGlEsVersion',
        name: 'device_gl_es_version',
        label: 'OpenGL ES version',
        description: 'OpenGL ES version the device supports.',
    },
    {
        apiName: 'deviceScreenSize',
        name: 'device_screen_size',
        label: 'Screen size',
        description:
            'Screen size class of the device, such as NORMAL or LARGE.',
    },
    {
        apiName: 'deviceScreenDpi',
        name: 'device_screen_dpi',
        label: 'Screen density',
        description: 'Screen density of the device, such as mdpi or hdpi.',
    },
];

const VITALS_FILTERABLE = [
    'versionCode',
    'countryCode',
    'apiLevel',
    'deviceBrand',
    'deviceType',
    'deviceModel',
];

const DATE_DIMENSION: LiveDimensionDefinition = {
    name: 'date',
    apiName: 'date',
    label: 'Date',
    type: DimensionType.DATE,
    filterOperators: GOOGLE_PLAY_DATE_FILTERS,
    description:
        'The day each row covers, in Pacific Time. Without Date in the query, rows cover only the latest day with data in the range. Queries without a date filter read the last 28 days.',
};

const toDimension = (
    { apiName, name, label, description, type }: DeviceDimension,
    filterable: string[],
): LiveDimensionDefinition => ({
    name,
    apiName,
    label,
    description,
    type: type ?? DimensionType.STRING,
    filterOperators: filterable.includes(apiName)
        ? GOOGLE_PLAY_EQUALS_FILTERS
        : [],
});

const NON_ADDITIVE: ApiSourceMetricAggregation = {
    aggregation: 'non_additive',
};

const metric = (
    name: string,
    apiName: string,
    label: string,
    description: string,
): LiveMetricDefinition => ({
    name,
    apiName,
    label,
    description,
    type: MetricType.NUMBER,
    filterOperators: [],
    aggregation: NON_ADDITIVE,
    format: '0.00%',
});

const rateFamily = (
    name: string,
    apiName: string,
    label: string,
    description: string,
): LiveMetricDefinition[] => [
    metric(
        `${name}_28d`,
        `${apiName}28dUserWeighted`,
        `${label} (28-day)`,
        `${description} Rolling average over the 28 days up to each day, each day weighted by its distinct users.`,
    ),
    metric(
        `${name}_7d`,
        `${apiName}7dUserWeighted`,
        `${label} (7-day)`,
        `${description} Rolling average over the 7 days up to each day, each day weighted by its distinct users.`,
    ),
    metric(name, apiName, label, `${description} Reported per day.`),
];

const DISTINCT_USERS: LiveMetricDefinition = {
    name: 'distinct_users',
    apiName: 'distinctUsers',
    label: 'Distinct users',
    description:
        'Distinct users the rates are computed over, per day, rounded to the nearest multiple of 10, 100, 1,000 or 1,000,000. Never add it up across days or dimension values: users would be counted more than once.',
    type: MetricType.NUMBER,
    filterOperators: [],
    aggregation: NON_ADDITIVE,
};

type GooglePlayExplore = {
    definition: LiveExploreDefinition;
    metricSet: GooglePlayMetricSet;
    /** A dimension the API always splits this metric set by. */
    requiredDimension: string | null;
};

const vitalsExplore = ({
    name,
    label,
    description,
    metricSet,
    metrics,
    extraDimensions = [],
    requiredDimension = null,
}: {
    name: string;
    label: string;
    description: string;
    metricSet: GooglePlayMetricSet;
    metrics: LiveMetricDefinition[];
    extraDimensions?: LiveDimensionDefinition[];
    requiredDimension?: string | null;
}): GooglePlayExplore => ({
    metricSet,
    requiredDimension,
    definition: {
        name,
        label,
        description,
        dimensions: [
            DATE_DIMENSION,
            ...extraDimensions,
            ...DEVICE_DIMENSIONS.map((dimension) =>
                toDimension(dimension, VITALS_FILTERABLE),
            ),
        ],
        metrics,
        maxDimensions: null,
        maxMetrics: null,
        dateRange: { dimension: 'date', defaultDays: 28 },
        incompatible: [],
    },
});

const ABOUT_RATES =
    'Rates are fractions of distinct users, computed by Google per day. Without Date, the query reads the latest day with data, so use the 7-day or 28-day rates. Google withholds dimension values with few users.';

const CRASHES = vitalsExplore({
    name: 'crashes',
    label: 'Crashes',
    description: `Android vitals crash rates for one Google Play app. ${ABOUT_RATES}`,
    metricSet: 'crashRateMetricSet',
    metrics: [
        ...rateFamily(
            'crash_rate',
            'crashRate',
            'Crash rate',
            'Share of distinct users who had at least one crash.',
        ),
        ...rateFamily(
            'user_perceived_crash_rate',
            'userPerceivedCrashRate',
            'User-perceived crash rate',
            'Share of distinct users who had at least one crash while using the app.',
        ),
        DISTINCT_USERS,
    ],
});

const ANRS = vitalsExplore({
    name: 'anrs',
    label: 'ANRs',
    description: `Android vitals ANR (app not responding) rates for one Google Play app. ${ABOUT_RATES}`,
    metricSet: 'anrRateMetricSet',
    metrics: [
        ...rateFamily(
            'anr_rate',
            'anrRate',
            'ANR rate',
            'Share of distinct users who had at least one ANR.',
        ),
        ...rateFamily(
            'user_perceived_anr_rate',
            'userPerceivedAnrRate',
            'User-perceived ANR rate',
            'Share of distinct users who had at least one ANR while using the app.',
        ),
        DISTINCT_USERS,
    ],
});

const START_TYPE: DeviceDimension = {
    apiName: 'startType',
    name: 'start_type',
    label: 'Start type',
    description:
        'How the app started: COLD, WARM or HOT. Google reports slow starts per start type, so select it or filter it to one value.',
};

const SLOW_STARTS = vitalsExplore({
    name: 'slow_starts',
    label: 'Slow starts',
    description: `Android vitals slow start rates for one Google Play app, per start type. ${ABOUT_RATES}`,
    metricSet: 'slowStartRateMetricSet',
    metrics: [
        ...rateFamily(
            'slow_start_rate',
            'slowStartRate',
            'Slow start rate',
            'Share of distinct users who had at least one slow start.',
        ),
        DISTINCT_USERS,
    ],
    extraDimensions: [
        toDimension(START_TYPE, [START_TYPE.apiName, ...VITALS_FILTERABLE]),
    ],
    requiredDimension: START_TYPE.apiName,
});

const EXCESSIVE_WAKEUPS = vitalsExplore({
    name: 'excessive_wakeups',
    label: 'Excessive wakeups',
    description: `Android vitals excessive wakeup rates for one Google Play app. ${ABOUT_RATES}`,
    metricSet: 'excessiveWakeupRateMetricSet',
    metrics: [
        ...rateFamily(
            'excessive_wakeup_rate',
            'excessiveWakeupRate',
            'Excessive wakeup rate',
            'Share of distinct users who had excessive wakeups.',
        ),
        DISTINCT_USERS,
    ],
});

const STUCK_WAKELOCKS = vitalsExplore({
    name: 'stuck_wakelocks',
    label: 'Stuck background wake locks',
    description: `Android vitals stuck background wake lock rates for one Google Play app. ${ABOUT_RATES}`,
    metricSet: 'stuckBackgroundWakelockRateMetricSet',
    metrics: [
        ...rateFamily(
            'stuck_wakelock_rate',
            'stuckBgWakelockRate',
            'Stuck background wake lock rate',
            'Share of distinct users who had a wake lock held in the background for over an hour.',
        ),
        DISTINCT_USERS,
    ],
});

const LOW_MEMORY_KILLS = vitalsExplore({
    name: 'low_memory_kills',
    label: 'Low memory kills',
    description: `Android vitals low memory kill rates for one Google Play app. ${ABOUT_RATES}`,
    metricSet: 'lmkRateMetricSet',
    metrics: [
        ...rateFamily(
            'low_memory_kill_rate',
            'userPerceivedLmkRate',
            'User-perceived low memory kill rate',
            'Share of distinct users whose app the system killed for low memory while they used it.',
        ),
        DISTINCT_USERS,
    ],
});

const ERROR_DIMENSIONS: DeviceDimension[] = [
    {
        apiName: 'reportType',
        name: 'report_type',
        label: 'Report type',
        description:
            'Kind of error: CRASH, ANR or NON_FATAL. Google reports errors per report type, so select it or filter it to one value.',
    },
    {
        apiName: 'issueId',
        name: 'issue_id',
        label: 'Issue ID',
        description: 'The error issue the reports are grouped into.',
    },
    {
        apiName: 'isUserPerceived',
        name: 'is_user_perceived',
        label: 'User perceived',
        description:
            'Whether the user noticed the error, such as USER_PERCEIVED or NOT_USER_PERCEIVED.',
    },
];

const ERRORS_FILTERABLE = [
    'reportType',
    'issueId',
    'versionCode',
    'deviceType',
];

const ERRORS: GooglePlayExplore = {
    metricSet: 'errorCountMetricSet',
    requiredDimension: 'reportType',
    definition: {
        name: 'errors',
        label: 'Error reports',
        description:
            'Android vitals error report counts for one Google Play app, per day and report type. Add Date to every query: Google counts error reports per day.',
        dimensions: [
            DATE_DIMENSION,
            ...[
                ...ERROR_DIMENSIONS,
                ...DEVICE_DIMENSIONS.filter(
                    ({ apiName }) => apiName !== 'countryCode',
                ),
            ].map((dimension) => toDimension(dimension, ERRORS_FILTERABLE)),
        ],
        metrics: [
            {
                name: 'error_reports',
                apiName: 'errorReportCount',
                label: 'Error reports',
                description: 'Error reports received, per day.',
                type: MetricType.SUM,
                filterOperators: [],
                aggregation: { aggregation: 'additive' },
            },
            {
                ...DISTINCT_USERS,
                description:
                    'Distinct users who sent error reports, per day, rounded to the nearest multiple of 10, 100, 1,000 or 1,000,000. Never add it up across days or dimension values: users would be counted more than once.',
            },
        ],
        maxDimensions: null,
        maxMetrics: null,
        dateRange: { dimension: 'date', defaultDays: 28 },
        incompatible: [],
    },
};

export const GOOGLE_PLAY_EXPLORES = [
    CRASHES,
    ANRS,
    SLOW_STARTS,
    EXCESSIVE_WAKEUPS,
    STUCK_WAKELOCKS,
    LOW_MEMORY_KILLS,
    ERRORS,
] as const;

const byMetricSet = (metricSet: GooglePlayMetricSet): GooglePlayExplore => {
    const explore = GOOGLE_PLAY_EXPLORES.find(
        (candidate) => candidate.metricSet === metricSet,
    );
    if (!explore) throw new Error(`Unknown metric set ${metricSet}`);
    return explore;
};

export const getGooglePlayExplore = (
    definitionName: string,
): GooglePlayExplore | undefined =>
    GOOGLE_PLAY_EXPLORES.find(
        ({ definition }) => definition.name === definitionName,
    );

/** The dimensions a metric set accepts, by API name, `date` included. */
export const getGooglePlayDimensions = (metricSet: GooglePlayMetricSet) =>
    byMetricSet(metricSet).definition.dimensions.map(({ apiName }) => apiName);

export const getGooglePlayMetrics = (metricSet: GooglePlayMetricSet) =>
    byMetricSet(metricSet).definition.metrics.map(({ apiName }) => apiName);

export const getGooglePlayRequiredDimension = (
    metricSet: GooglePlayMetricSet,
) => byMetricSet(metricSet).requiredDimension;

export const isGooglePlayRollingMetric = (apiName: string) =>
    /(7d|28d)UserWeighted$/.test(apiName);
