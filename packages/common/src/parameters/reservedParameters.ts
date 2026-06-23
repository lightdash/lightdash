import { type DateZoom } from '../types/api/paginatedQuery';
import { type LightdashProjectParameter } from '../types/lightdashProjectConfig';
import {
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
} from '../types/parameters';
import { getGranularityReferenceValue } from '../types/timeFrames';

/**
 * Context handed to reserved parameter resolvers. Each reserved parameter reads only
 * what it needs. Extend this as new system values are exposed as reserved parameters.
 */
export type ReservedParameterContext = {
    dateZoom: DateZoom | undefined;
};

/**
 * A reserved (system-owned) parameter. It shares the user-parameter definition shape so
 * it rides the existing substitution/Liquid/autocomplete pipeline, plus a `resolve`
 * function that computes its value from the query context.
 */
export type ReservedParameterDefinition = LightdashProjectParameter & {
    resolve: (context: ReservedParameterContext) => ParameterValue;
};

/**
 * The registry of reserved parameters. Add an entry here to expose a new system value;
 * everything else (availability during compilation, name collision rejection, value
 * injection, UI) is driven off this map.
 */
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

/**
 * Reserved names that are shadowed by a user/project/explore parameter of the same name.
 * A user-defined parameter always takes priority over a reserved one (collisions never
 * fail). Used to surface the override in the UI and as a non-fatal compile warning.
 */
export const getShadowedReservedNames = (
    userParameterNames: string[],
): string[] => {
    const userNames = new Set(userParameterNames);
    return getReservedParameterNames().filter((name) => userNames.has(name));
};

/**
 * Shared precedence rule for name collisions: user parameters win, reserved names are
 * appended only when not already taken. Deduplicated. Used wherever reserved names join
 * the available-parameter set so availability never disagrees with values/definitions.
 */
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
