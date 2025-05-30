import { AiMetricQuery } from '@lightdash/common';
import { ProjectService } from '../../../../services/ProjectService/ProjectService';

export type RunMiniMetricQuery = (
    metricQuery: AiMetricQuery,
) => ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>;
