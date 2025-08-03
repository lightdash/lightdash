// Used anywhere we have parameters
export type ParametersValuesMap = Record<string, string | string[]>;

// Used in dashbaords where we maybe have properties
// specific to dashbaord tiles
export type DashboardParameterValue = {
    parameterName: string;
    value: string | string[];
};

export type DashboardParameters = Record<string, DashboardParameterValue>;
