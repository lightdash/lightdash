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
