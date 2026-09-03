import { type ChartAsCodeLanguageMap } from './chartAsCode';
import { type DashboardAsCodeLanguageMap } from './dashboardAsCode';

export type ParameterLanguageMap = {
    [parameterName: string]: {
        label: string;
    };
};

export type LanguageMap = Partial<
    ChartAsCodeLanguageMap & DashboardAsCodeLanguageMap
> & {
    parameters?: ParameterLanguageMap;
};
