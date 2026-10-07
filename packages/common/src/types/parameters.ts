import { CompileError } from './errors';
import type { LightdashProjectParameter } from './lightdashProjectConfig';

// Base type for parameter values - can be extended later for new types (dates, booleans, etc.)
export type ParameterValue = string | number | string[] | number[];
export type EscapedParameterValue = string | number | Array<string | number>;

// Used anywhere we have parameters
export type ParametersValuesMap = Record<string, ParameterValue>;

type EscapeParameterValueOptions = {
    escapeString?: (value: string) => string;
    allowMixedArrayValues?: false;
};

type EscapeMixedParameterValueOptions = {
    escapeString?: (value: string) => string;
    allowMixedArrayValues: true;
};

export function escapeParameterValue(
    value: unknown,
    options: EscapeMixedParameterValueOptions,
): EscapedParameterValue;
export function escapeParameterValue(
    value: unknown,
    options?: EscapeParameterValueOptions,
): ParameterValue;
export function escapeParameterValue(
    value: unknown,
    options:
        | EscapeParameterValueOptions
        | EscapeMixedParameterValueOptions = {},
): EscapedParameterValue {
    const { escapeString, allowMixedArrayValues = false } = options;

    if (typeof value === 'string') {
        return escapeString ? escapeString(value) : value;
    }

    if (typeof value === 'number') {
        return value;
    }

    if (Array.isArray(value)) {
        const hasOnlyStrings = value.every(
            (item): item is string => typeof item === 'string',
        );
        const hasOnlyNumbers = value.every(
            (item): item is number => typeof item === 'number',
        );
        const hasOnlyPrimitiveValues = value.every(
            (item) => typeof item === 'string' || typeof item === 'number',
        );

        if (
            hasOnlyPrimitiveValues &&
            (allowMixedArrayValues || hasOnlyStrings || hasOnlyNumbers)
        ) {
            return value.map((item) =>
                typeof item === 'string' && escapeString
                    ? escapeString(item)
                    : item,
            );
        }

        throw new CompileError(
            allowMixedArrayValues
                ? 'Parameter arrays must contain only strings and numbers'
                : 'Parameter arrays must contain only strings or only numbers',
        );
    }

    throw new CompileError(
        'Parameters must be strings, numbers, or arrays of strings or numbers',
    );
}

export type ParameterDefinitions = Record<string, LightdashProjectParameter>;

// Used in dashbaords where we maybe have properties
// specific to dashbaord tiles
export type DashboardParameterValue = {
    parameterName: string;
    value: ParameterValue;
};

export type DashboardParameters = Record<string, DashboardParameterValue>;

// Index-signature literal on purpose: TSOA caches an empty model for
// Record<string, X> inside mapped types (see DashboardTileTargets in filter.ts)
export type DashboardParameterControlTileTargets = {
    [tileUuid: string]: string | false;
};

// One control on the dashboard bar that sets one or more parameters.
// The value lives in the dashboard's `parameters`, one entry per key.
export type DashboardParameterControl = {
    id: string;
    label: string;
    parameterKeys: string[];
    // No entry: the control sets every one of its parameters the tile uses.
    // A key: it sets only that one. false: it does not set the tile.
    tileTargets: DashboardParameterControlTileTargets;
};
