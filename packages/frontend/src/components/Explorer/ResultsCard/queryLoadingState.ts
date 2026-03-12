import { QueryHistoryStatus } from '@lightdash/common';

export const getQueryLoadingStateCopy = (
    queryStatus?: QueryHistoryStatus,
): { title: string; description?: string } => {
    switch (queryStatus) {
        case QueryHistoryStatus.QUEUED:
            return {
                title: 'Your query is queued...',
                description:
                    'It will start automatically when a worker is available.',
            };
        case QueryHistoryStatus.EXECUTING:
            return {
                title: 'Executing query...',
            };
        default:
            return {
                title: 'Loading results',
            };
    }
};
