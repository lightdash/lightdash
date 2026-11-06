import {
    ExploreType,
    ExternalSourceType,
    type ApiConnectorType,
    type SummaryExplore,
} from '@lightdash/common';
import { type DataSourceIconSource } from './DataSourceIcon';

export const externalSourceIconOf = (
    sourceType: ExternalSourceType,
): DataSourceIconSource =>
    sourceType === ExternalSourceType.GOOGLE_SHEETS
        ? { type: 'sheets' }
        : { type: 'csv' };

/**
 * The icon source of an explore that doesn't read the warehouse, or null for
 * one that does. Summaries don't say which integration a live explore reads,
 * so the caller passes it in.
 */
export const exploreSourceIconOf = (
    explore: SummaryExplore,
    liveIntegration: ApiConnectorType | undefined,
): DataSourceIconSource | null => {
    if (explore.type === ExploreType.API_SOURCE) {
        return { type: 'live', integration: liveIntegration };
    }
    const externalSource =
        'externalSource' in explore ? explore.externalSource : undefined;
    return externalSource
        ? externalSourceIconOf(externalSource.sourceType)
        : null;
};
