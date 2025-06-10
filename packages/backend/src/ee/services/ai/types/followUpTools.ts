import { z } from 'zod';

export enum FollowUpTools {
    GENERATE_CSV = 'generate_csv',
    GENERATE_BAR_VIZ = 'generate_bar_viz',
    GENERATE_TIME_SERIES_VIZ = 'generate_time_series_viz',
}

export type FollowUpToolsText = {
    [key in FollowUpTools]: string;
};

export const followUpToolsText: FollowUpToolsText = {
    [FollowUpTools.GENERATE_CSV]: 'Generate a CSV File',
    [FollowUpTools.GENERATE_BAR_VIZ]: 'Generate a Bar Chart',
    [FollowUpTools.GENERATE_TIME_SERIES_VIZ]: 'Generate a Time Series Chart',
};

export const followUpToolsSchema = z.nativeEnum(FollowUpTools).array();
