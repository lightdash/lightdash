import { assertUnreachable, ForbiddenError } from '@lightdash/common';
import { validate as isUuid } from 'uuid';
import type { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import type { DeploySessionModel } from '../../models/DeploySessionModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import type { SavedChartModel } from '../../models/SavedChartModel';
import type { SavedSqlModel } from '../../models/SavedSqlModel';
import type { SchedulerModel } from '../../models/SchedulerModel';
import type { GrantResourceType } from './operationContracts';

export type GrantResourceReference = {
    type: GrantResourceType;
    uuid: string;
    projectUuid: string | null;
};
export type GrantResourceResolver = Pick<
    AgentConnectionGrantResourceResolver,
    'resolveProjectUuid' | 'resolveResourceProjectUuid' | 'resolveDeploySession'
>;

export class AgentConnectionGrantResourceResolver {
    constructor(
        private readonly deps: {
            deploySessionModel: Pick<DeploySessionModel, 'getSession'>;
            projectModel: Pick<ProjectModel, 'getUuidBySlug' | 'getSummary'>;
            savedSqlModel: Pick<SavedSqlModel, 'getByUuid' | 'getBySlug'>;
            savedChartModel: Pick<SavedChartModel, 'get' | 'getSummary'>;
            dashboardModel: Pick<
                DashboardModel,
                'getByIdOrSlug' | 'getSummaryByUuid'
            >;
            schedulerModel: Pick<SchedulerModel, 'getScheduler'>;
            queryHistoryModel: Pick<QueryHistoryModel, 'getByQueryUuid'>;
        },
    ) {}

    async resolveProjectUuid(
        organizationUuid: string,
        uuidOrSlug: string,
    ): Promise<string> {
        const uuid = isUuid(uuidOrSlug)
            ? uuidOrSlug
            : await this.deps.projectModel.getUuidBySlug(
                  organizationUuid,
                  uuidOrSlug,
              );
        const project = await this.deps.projectModel.getSummary(uuid);
        if (project.organizationUuid !== organizationUuid)
            throw new ForbiddenError(
                'Project does not belong to this organization',
            );
        return uuid;
    }

    async resolveDeploySession(
        sessionUuid: string,
    ): Promise<{ projectUuid: string; userUuid: string }> {
        return this.deps.deploySessionModel.getSession(sessionUuid);
    }

    async resolveResourceProjectUuid(
        resource: GrantResourceReference,
    ): Promise<string | null> {
        if (!isUuid(resource.uuid) && resource.projectUuid === null)
            return null;
        switch (resource.type) {
            case 'sql_chart':
                return isUuid(resource.uuid)
                    ? (await this.deps.savedSqlModel.getByUuid(resource.uuid))
                          .project.projectUuid
                    : ((
                          await this.deps.savedSqlModel.getBySlug(
                              resource.projectUuid!,
                              resource.uuid,
                          )
                      )?.project.projectUuid ?? null);
            case 'saved_chart':
                return isUuid(resource.uuid)
                    ? (
                          await this.deps.savedChartModel.getSummary(
                              resource.uuid,
                          )
                      ).projectUuid
                    : (
                          await this.deps.savedChartModel.get(
                              resource.uuid,
                              undefined,
                              { projectUuid: resource.projectUuid! },
                          )
                      ).projectUuid;
            case 'dashboard':
                return isUuid(resource.uuid)
                    ? (
                          await this.deps.dashboardModel.getSummaryByUuid(
                              resource.uuid,
                          )
                      ).projectUuid
                    : (
                          await this.deps.dashboardModel.getByIdOrSlug(
                              resource.uuid,
                              { projectUuid: resource.projectUuid! },
                          )
                      ).projectUuid;
            case 'scheduler':
                return (
                    (await this.deps.schedulerModel.getScheduler(resource.uuid))
                        .projectUuid ?? null
                );
            case 'query':
                return (
                    (
                        await this.deps.queryHistoryModel.getByQueryUuid(
                            resource.uuid,
                        )
                    )?.projectUuid ?? null
                );
            default:
                return assertUnreachable(
                    resource.type,
                    'Unknown grant resource',
                );
        }
    }
}
