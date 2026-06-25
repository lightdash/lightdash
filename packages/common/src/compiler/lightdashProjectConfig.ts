import { ParseError } from '../types/errors';
import type { Explore } from '../types/explore';
import type { Metric } from '../types/field';
import type { MetricFilterRule } from '../types/filter';
import type {
    LightdashProjectConfig,
    ProjectDefaults,
} from '../types/lightdashProjectConfig';
import { TimeFrames } from '../types/timeFrames';
import type { ResolvedAdditionalTimeIntervals } from '../utils/timeFrames';

const STANDARD_TIME_FRAMES: ReadonlySet<string> = new Set(
    Object.values(TimeFrames),
);

const isStandardTimeFrame = (value: string): value is TimeFrames =>
    STANDARD_TIME_FRAMES.has(value);

/** Standard time frames that are meaningless on a plain DATE dimension. */
const DATE_INVALID_TIME_FRAMES: ReadonlySet<TimeFrames> = new Set([
    TimeFrames.RAW,
    TimeFrames.MILLISECOND,
    TimeFrames.SECOND,
    TimeFrames.MINUTE,
    TimeFrames.HOUR,
]);

type SpotlightConfigArgs = {
    visibility?: LightdashProjectConfig['spotlight']['default_visibility'];
    categories?: string[];
    filterBy?: string[];
    segmentBy?: string[];
    defaultSegment?: string;
    defaultFilter?: MetricFilterRule;
    owner?: string;
};

const validateOwner = (owner: unknown): string | null => {
    if (typeof owner === 'string') return owner;
    if (owner !== undefined) {
        // eslint-disable-next-line no-console
        console.warn(
            `Invalid spotlight owner: expected string, got ${typeof owner}`,
        );
    }
    return null;
};

/**
 * Get the spotlight configuration for a resource
 */
export const getSpotlightConfigurationForResource = ({
    visibility,
    categories,
    filterBy,
    segmentBy,
    defaultSegment,
    defaultFilter,
    owner,
}: SpotlightConfigArgs):
    | Pick<Explore, 'spotlight'>
    | Pick<Metric, 'spotlight'> => {
    if (visibility === undefined) {
        return {};
    }

    const validatedOwner = validateOwner(owner);

    return {
        spotlight: {
            visibility,
            categories,
            ...(filterBy ? { filterBy } : {}),
            ...(segmentBy ? { segmentBy } : {}),
            ...(defaultSegment ? { defaultSegment } : {}),
            ...(defaultFilter ? { defaultFilter } : {}),
            ...(validatedOwner ? { owner: validatedOwner } : {}),
        },
    };
};

/**
 * Get the categories from the resource and validate them against the project config
 * @param resourceType - The type of the resource
 * @param resourceName - The name of the resource
 * @param spotlightConfig - The spotlight config
 * @param resourceCategories - The categories from the resource
 * @returns The categories from the resource
 */
export const getCategoriesFromResource = (
    resourceType: 'metric' | 'explore',
    resourceName: string,
    spotlightConfig: LightdashProjectConfig['spotlight'] | undefined,
    resourceCategories: string[] | undefined = [],
) => {
    // Get all valid category references from the global spotlight config
    const categoriesDefinedInProjectConfig =
        Object.keys(spotlightConfig?.categories || {}) || [];

    // Check if any metric categories aren't defined in the global config
    const invalidCategories = resourceCategories.filter(
        (category) => !categoriesDefinedInProjectConfig.includes(category),
    );

    if (invalidCategories.length > 0) {
        throw new ParseError(
            `Invalid spotlight categories found in ${resourceType} '${resourceName}': ${invalidCategories.join(
                ', ',
            )}. Categories must be defined in project config.`,
        );
    }

    return resourceCategories;
};

const resolveAdditionalTimeIntervalList = (
    values: (TimeFrames | string)[] | undefined,
    key: 'date' | 'timestamp',
    customGranularities: LightdashProjectConfig['custom_granularities'],
): string[] =>
    (values ?? []).reduce<string[]>((acc, raw) => {
        const upper = raw.toUpperCase();
        if (isStandardTimeFrame(upper)) {
            if (key === 'date' && DATE_INVALID_TIME_FRAMES.has(upper)) {
                // eslint-disable-next-line no-console
                console.warn(
                    `Ignoring sub-day time interval "${raw}" in defaults.additional_time_intervals.date — not valid for DATE dimensions.`,
                );
                return acc;
            }
            return [...acc, upper];
        }
        if (customGranularities?.[raw]) {
            return [...acc, raw];
        }
        // eslint-disable-next-line no-console
        console.warn(
            `Ignoring unknown time interval "${raw}" in defaults.additional_time_intervals.${key} — not a standard granularity or a defined custom_granularity.`,
        );
        return acc;
    }, []);

/**
 * Validate `defaults.additional_time_intervals` once: keep standard grains
 * (uppercased) and defined custom-granularity keys; drop sub-day grains under
 * `date` and unknown names (each with a single console.warn).
 */
export const resolveAdditionalTimeIntervals = (
    additionalTimeIntervals: ProjectDefaults['additional_time_intervals'],
    customGranularities: LightdashProjectConfig['custom_granularities'],
): ResolvedAdditionalTimeIntervals => ({
    date: resolveAdditionalTimeIntervalList(
        additionalTimeIntervals?.date,
        'date',
        customGranularities,
    ),
    timestamp: resolveAdditionalTimeIntervalList(
        additionalTimeIntervals?.timestamp,
        'timestamp',
        customGranularities,
    ),
});
