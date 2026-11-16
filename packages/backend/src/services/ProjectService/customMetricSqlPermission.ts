import {
    NotFoundError,
    type Account,
    type AdditionalMetric,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import type { ProjectService } from './ProjectService';

/** The explore as `account` sees it, as the run-time custom SQL check does. */
export const getCustomMetricExploreTables = async (
    getProjectService: () => Pick<ProjectService, 'getExplore'>,
    account: Account,
    projectUuid: string,
    metricQuery: Pick<MetricQuery, 'exploreName' | 'additionalMetrics'>,
): Promise<Explore['tables']> => {
    if (!metricQuery.additionalMetrics?.length) return {};
    try {
        const explore = await getProjectService().getExplore(
            account,
            projectUuid,
            metricQuery.exploreName,
        );
        return explore.tables;
    } catch (error) {
        if (error instanceof NotFoundError) return {};
        throw error;
    }
};

export const getCustomMetricSqlPermissionMessage = (
    metrics: AdditionalMetric[],
): string =>
    `Custom metrics written in SQL need permission to manage custom fields: ${metrics
        .map((metric) => metric.label ?? metric.name)
        .join(', ')}`;
