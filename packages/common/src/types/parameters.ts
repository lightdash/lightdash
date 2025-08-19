import type { LightdashProjectParameter } from './lightdashProjectConfig';

// Used anywhere we have parameters
export type ParametersValuesMap = Record<
    string,
    string | number | string[] | number[]
>;

export type ParameterDefinitions = Record<string, LightdashProjectParameter>;

// Used in dashbaords where we maybe have properties
// specific to dashbaord tiles
export type DashboardParameterValue = {
    parameterName: string;
    value: string | number | string[] | number[];
};

export type DashboardParameters = Record<string, DashboardParameterValue>;
