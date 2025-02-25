import { type ChartAsCodeLanguageMap } from './chartAsCode';
import { type DashboardAsCodeLanguageMap } from './dashboardAsCode';

export type LanguageMap = Partial<
    ChartAsCodeLanguageMap & DashboardAsCodeLanguageMap
>;
