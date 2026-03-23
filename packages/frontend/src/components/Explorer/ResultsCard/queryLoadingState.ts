import { QueryHistoryStatus } from '@lightdash/common';

export const getQueryLoadingStateCopy = (
    queryStatus?: QueryHistoryStatus,
): { title: string; description?: string } => {
    switch (queryStatus) {
        case QueryHistoryStatus.QUEUED:
            return {
                title: 'Your query is queued...',
                description:
                    'We’ll start processing your query as soon as possible.',
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
