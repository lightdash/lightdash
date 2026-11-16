import { type DashboardControlSection, type WeekDay } from '@lightdash/common';
import { type DateZoomStorySettings } from './StoryProviders';

/** A story's `parameters.dashboard`: what it changes about the dashboard. */
export type DashboardStoryParameters = {
    startOfWeek?: WeekDay;
    sections?: DashboardControlSection[];
    /** False: no tile uses a parameter. */
    hasParameters?: boolean;
    /** One tile over 2,000 fields. */
    isManyFields?: boolean;
    /** Saved date zoom settings: grains, default, named zooms. */
    dateZoom?: DateZoomStorySettings;
};
