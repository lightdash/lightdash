import { z } from 'zod';
import { AiResultType } from './types';

export type FollowUpToolsText = {
    [key in AiResultType]: string;
};

export const followUpToolsText: FollowUpToolsText = {
    [AiResultType.TABLE_RESULT]: 'Generate a Table',
    [AiResultType.VERTICAL_BAR_RESULT]: 'Generate a Bar Chart',
    [AiResultType.TIME_SERIES_RESULT]: 'Generate a Time Series Chart',
};

export const followUpToolsSchema = z.nativeEnum(AiResultType).array();
