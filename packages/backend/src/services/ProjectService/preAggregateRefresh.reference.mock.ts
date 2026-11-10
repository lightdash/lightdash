import {
    ForbiddenError,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import { type PreAggregateModel } from '../../ee/models/PreAggregateModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { agentExecutionContext } from '../AiAccessService/agentExecutionContext';

export class PreAggregateRefreshReference {
    constructor(
        private readonly projectModel: Pick<
            ProjectModel,
            'getAllExploresFromCache'
        >,
        private readonly preAggregateModel: Pick<
            PreAggregateModel,
            'getPreAggregateDefinitionsForProject'
        >,
    ) {}

    async assertConnectionPreAggregateRefresh(
        projectUuid: string,
        explores: (Explore | ExploreError)[] = [],
    ): Promise<void> {
        if (!agentExecutionContext.getStore()?.agentConnectionExecution) return;
        const definitions =
            await this.preAggregateModel.getPreAggregateDefinitionsForProject(
                projectUuid,
            );
        const cachedExplores =
            await this.projectModel.getAllExploresFromCache(projectUuid);
        if (
            definitions.some((definition) => definition.refreshCron !== null) ||
            Object.values(cachedExplores).some(
                (explore) =>
                    'preAggregates' in explore &&
                    explore.preAggregates?.some(
                        (definition) => definition.refresh?.cron != null,
                    ),
            )
        )
            throw new ForbiddenError(
                'This agent connection cannot deploy to, refresh or change parameters of this project, because the project has pre-aggregates with a scheduled refresh. A person can do this, or use a project without scheduled pre-aggregate refreshes.',
            );
        if (
            explores.some(
                (explore) =>
                    'preAggregates' in explore &&
                    explore.preAggregates?.some(
                        (definition) => definition.refresh?.cron != null,
                    ),
            )
        )
            throw new ForbiddenError(
                'This agent connection cannot add a pre-aggregate with a scheduled refresh. A person can add it.',
            );
    }
}
