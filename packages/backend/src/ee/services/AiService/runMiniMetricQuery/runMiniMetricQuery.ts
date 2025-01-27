import { MetricQuery } from '@lightdash/common';
import { ProjectService } from '../../../../services/ProjectService/ProjectService';

export type MiniMetricQuery = Pick<
    MetricQuery,
    'metrics' | 'dimensions' | 'sorts' | 'limit' | 'exploreName' | 'filters'
>;

export type RunMiniMetricQuery = (
    metricQuery: MiniMetricQuery,
) => ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>;
