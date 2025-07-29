export type ParametersValuesMap = Record<string, string | string[]>;

export type DashboardParameterValue = {
    parameterName: string;
    value: string | string[];
};

export type DashboardParameters = Record<string, DashboardParameterValue>;
