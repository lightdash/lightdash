import { type DateZoom } from '../types/api/paginatedQuery';
import { type LightdashProjectParameter } from '../types/lightdashProjectConfig';
import {
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
} from '../types/parameters';
import { getGranularityReferenceValue } from '../types/timeFrames';

/** Context from which reserved parameters resolve their values. */
export type ReservedParameterContext = {
    dateZoom: DateZoom | undefined;
};

/**
 * A reserved (system-owned) parameter: the user-parameter shape plus a `resolve` that
 * computes its value from the query context, so it rides the existing parameter pipeline.
 */
export type ReservedParameterDefinition = LightdashProjectParameter & {
    resolve: (context: ReservedParameterContext) => ParameterValue;
};

/** Registry of reserved parameters. Add an entry here to expose a new system value. */
export const RESERVED_PARAMETERS: Record<string, ReservedParameterDefinition> =
    {
        date_zoom: {
            label: 'Date zoom',
            description:
                'The selected date zoom granularity in lowercase (e.g. "week"). Empty when no date zoom is selected.',
            type: 'string',
            resolve: ({ dateZoom }) =>
                dateZoom?.granularity
                    ? getGranularityReferenceValue(dateZoom.granularity)
                    : '',
        },
    };

export const getReservedParameterNames = (): string[] =>
    Object.keys(RESERVED_PARAMETERS);

export const isReservedParameterName = (name: string): boolean =>
    name in RESERVED_PARAMETERS;

/**
 * Reserved parameter definitions in the shared definition shape (without resolvers), for
 * merging into the available-parameter map and rendering in the parameters UI.
 */
export const getReservedParameterDefinitions = (): ParameterDefinitions =>
    Object.entries(RESERVED_PARAMETERS).reduce<ParameterDefinitions>(
        (acc, [name, { resolve, ...definition }]) => ({
            ...acc,
            [name]: definition,
        }),
        {},
    );

/**
 * Resolve every reserved parameter to its value for the given query context.
 */
export const resolveReservedParameterValues = (
    context: ReservedParameterContext,
): ParametersValuesMap =>
    Object.entries(RESERVED_PARAMETERS).reduce<ParametersValuesMap>(
        (acc, [name, { resolve }]) => ({
            ...acc,
            [name]: resolve(context),
        }),
        {},
    );

/** Reserved names shadowed by a same-named user parameter (used to surface the override). */
export const getShadowedReservedNames = (
    userParameterNames: string[],
): string[] => {
    const userNames = new Set(userParameterNames);
    return getReservedParameterNames().filter((name) => userNames.has(name));
};

/** Append reserved names not already taken by a user parameter (deduped, user wins). */
export const mergeReservedNames = (userParameterNames: string[]): string[] => {
    const userNames = new Set(userParameterNames);
    return [
        ...userParameterNames,
        ...getReservedParameterNames().filter((name) => !userNames.has(name)),
    ];
};

/**
 * Merge reserved definitions under user definitions; a user definition of the same name
 * wins (shadows the reserved entry).
 */
export const mergeReservedDefinitions = (
    userDefinitions: ParameterDefinitions | undefined,
): ParameterDefinitions => ({
    ...getReservedParameterDefinitions(),
    ...(userDefinitions ?? {}),
});

/**
 * Merge resolved reserved values under user values; a user value of the same name wins
 * (shadows the reserved value).
 */
export const mergeReservedValues = (
    userValues: ParametersValuesMap | undefined,
    reservedValues: ParametersValuesMap,
): ParametersValuesMap => ({
    ...reservedValues,
    ...(userValues ?? {}),
});
