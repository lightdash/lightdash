import { z } from 'zod';

export enum FollowUpTools {
    GENERATE_TABLE = 'generate_table',
    GENERATE_BAR_VIZ = 'generate_bar_viz',
    GENERATE_TIME_SERIES_VIZ = 'generate_time_series_viz',
}

export type FollowUpToolsText = {
    [key in FollowUpTools]: string;
};

export const followUpToolsText: FollowUpToolsText = {
    [FollowUpTools.GENERATE_TABLE]: 'Generate a Table',
    [FollowUpTools.GENERATE_BAR_VIZ]: 'Generate a Bar Chart',
    [FollowUpTools.GENERATE_TIME_SERIES_VIZ]: 'Generate a Time Series Chart',
};

export const followUpToolsSchema = z.nativeEnum(FollowUpTools).array();
