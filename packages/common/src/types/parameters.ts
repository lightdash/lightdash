import type { LightdashProjectParameter } from './lightdashProjectConfig';

// Base type for parameter values - can be extended later for new types (dates, booleans, etc.)
export type ParameterValue = string | number | string[] | number[];

// Used anywhere we have parameters
export type ParametersValuesMap = Record<string, ParameterValue>;

export type ParameterDefinitions = Record<string, LightdashProjectParameter>;

// Used in dashbaords where we maybe have properties
// specific to dashbaord tiles
export type DashboardParameterValue = {
    parameterName: string;
    value: ParameterValue;
};

export type DashboardParameters = Record<string, DashboardParameterValue>;
