import { type DashboardControlSection, type WeekDay } from '@lightdash/common';

/** A story's `parameters.dashboard`: what it changes about the dashboard. */
export type DashboardStoryParameters = {
    startOfWeek?: WeekDay;
    sections?: DashboardControlSection[];
};
