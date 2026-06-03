import { z } from 'zod';
import { AiResultType } from './types';

export type FollowUpToolsText = {
    [key in AiResultType]: string;
};

export const followUpToolsText: FollowUpToolsText = {
    [AiResultType.TABLE_RESULT]: 'Generate a Table',
    [AiResultType.VERTICAL_BAR_RESULT]: 'Generate a Bar Chart',
    [AiResultType.TIME_SERIES_RESULT]: 'Generate a Time Series Chart',
    [AiResultType.QUERY_RESULT]: 'Run Query',
    [AiResultType.DASHBOARD_RESULT]: 'Generate a Dashboard',
    [AiResultType.DASHBOARD_V2_RESULT]: 'Generate a Dashboard (v2)',
    [AiResultType.IMPROVE_CONTEXT]: 'Improve Context',
    [AiResultType.PROPOSE_CHANGE]: 'Propose a Change',
};

export enum LegacyFollowUpTools {
    GENERATE_TABLE = 'generate_table',
    GENERATE_BAR_VIZ = 'generate_bar_viz',
    GENERATE_TIME_SERIES_VIZ = 'generate_time_series_viz',
}

export const legacyToNewMapping: Record<string, AiResultType> = {
    [LegacyFollowUpTools.GENERATE_TABLE]: AiResultType.TABLE_RESULT,
    [LegacyFollowUpTools.GENERATE_BAR_VIZ]: AiResultType.VERTICAL_BAR_RESULT,
    [LegacyFollowUpTools.GENERATE_TIME_SERIES_VIZ]:
        AiResultType.TIME_SERIES_RESULT,
};

export const legacyFollowUpToolsTransform = (
    tools: (
        | AiResultType.VERTICAL_BAR_RESULT
        | AiResultType.TABLE_RESULT
        | AiResultType.TIME_SERIES_RESULT
        | LegacyFollowUpTools.GENERATE_TABLE
        | LegacyFollowUpTools.GENERATE_BAR_VIZ
        | LegacyFollowUpTools.GENERATE_TIME_SERIES_VIZ
    )[],
): AiResultType[] =>
    tools.map((tool) => {
        if (tool in legacyToNewMapping) {
            return legacyToNewMapping[tool];
        }
        return tool as unknown as AiResultType;
    });

// this is used only for slack at the moment, so no backwards compatibility is needed
// TODO :: reuse this schema across the tools
export const followUpToolsSchema = z.nativeEnum(AiResultType).array();
export type FollowUpTools = z.infer<typeof followUpToolsSchema>;
