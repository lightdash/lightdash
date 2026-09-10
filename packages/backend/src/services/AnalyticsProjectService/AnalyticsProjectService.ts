import {
    AnalyticsProjectStatus,
    ConflictError,
    EnsureAnalyticsProjectResult,
    ForbiddenError,
    isUserWithOrg,
    NotFoundError,
    SessionUser,
} from '@lightdash/common';
import { analyticsContentAsCode } from '../../analytics/systemExplores/sampleContent';
import { type DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type SavedChartModel } from '../../models/SavedChartModel';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';
import { type CoderService } from '../CoderService/CoderService';
import { ProjectService } from '../ProjectService/ProjectService';

type Dependencies = {
    coderService: Pick<CoderService, 'upsertChart' | 'upsertDashboard'>;
    dashboardModel: Pick<DashboardModel, 'find'>;
    savedChartModel: Pick<SavedChartModel, 'get'>;
    projectModel: Pick<
        ProjectModel,
        'getAllByOrganizationUuid' | 'runInAnalyticsProvisioningLock'
    >;
    projectService: Pick<
        ProjectService,
        'assertAnalyticsProjectAccess' | 'ensureAnalyticsProject' | 'delete'
    >;
    userModel: Pick<UserModel, 'invalidateSessionUserCache'>;
};

export class AnalyticsProjectService extends BaseService {
    constructor(private readonly dependencies: Dependencies) {
        super();
    }

    private async authorize(user: SessionUser): Promise<string> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        await this.dependencies.projectService.assertAnalyticsProjectAccess(
            user,
            {
                organizationUuid: user.organizationUuid,
                provisioningSource: 'analytics',
            },
        );
        return user.organizationUuid;
    }

    async getStatus(user: SessionUser): Promise<AnalyticsProjectStatus> {
        const organizationUuid = await this.authorize(user);
        const projects =
            await this.dependencies.projectModel.getAllByOrganizationUuid(
                organizationUuid,
            );
        const project = projects.find(
            (candidate) => candidate.provisioningSource === 'analytics',
        );
        return {
            project: project
                ? {
                      projectUuid: project.projectUuid,
                      name: project.name,
                      slug: project.slug ?? null,
                      url: `/projects/${project.slug ?? project.projectUuid}/tables`,
                      createdAt: new Date(project.createdAt).toISOString(),
                  }
                : null,
        };
    }

    async ensure(user: SessionUser): Promise<EnsureAnalyticsProjectResult> {
        const result =
            await this.dependencies.projectService.ensureAnalyticsProject(user);
        await this.installSampleContent(user);
        return result;
    }

    async installSampleContent(user: SessionUser): Promise<void> {
        const organizationUuid = await this.authorize(user);
        await this.dependencies.projectModel.runInAnalyticsProvisioningLock(
            organizationUuid,
            async () => {
                const projects =
                    await this.dependencies.projectModel.getAllByOrganizationUuid(
                        organizationUuid,
                    );
                const project = projects.find(
                    (candidate) => candidate.provisioningSource === 'analytics',
                );
                if (!project)
                    throw new NotFoundError('Analytics project not found');
                // The org lock serializes syncs; interrupted uploads are retryable.
                /* eslint-disable no-await-in-loop */
                for (const { dashboard, charts } of analyticsContentAsCode) {
                    for (const chart of charts) {
                        const existing = await this.dependencies.savedChartModel
                            .get(chart.slug, undefined, {
                                projectUuid: project.projectUuid,
                                deleted: 'any',
                            })
                            .catch((error: unknown) => {
                                if (error instanceof NotFoundError) return null;
                                throw error;
                            });
                        if (
                            existing &&
                            (existing.slug !== chart.slug ||
                                existing.dashboardSlug !== dashboard.slug)
                        ) {
                            throw new ConflictError(
                                `Chart slug ${chart.slug} belongs to content outside its managed dashboard`,
                            );
                        }
                    }
                }
                for (const { dashboard, charts } of analyticsContentAsCode) {
                    const options = {
                        spaceNames: { [dashboard.spaceSlug]: dashboard.name },
                        publicSpaceCreate: true,
                        force: true,
                    };
                    const [existingDashboard] =
                        await this.dependencies.dashboardModel.find({
                            projectUuid: project.projectUuid,
                            slug: dashboard.slug,
                        });
                    // Restore the dashboard before uploading any owned charts.
                    if (!existingDashboard) {
                        await this.dependencies.coderService.upsertDashboard(
                            user,
                            project.projectUuid,
                            dashboard.slug,
                            { ...dashboard, tiles: [] },
                            options,
                        );
                    }
                    for (const chart of charts) {
                        await this.dependencies.coderService.upsertChart(
                            user,
                            project.projectUuid,
                            chart.slug,
                            chart,
                            options,
                        );
                    }
                    await this.dependencies.coderService.upsertDashboard(
                        user,
                        project.projectUuid,
                        dashboard.slug,
                        dashboard,
                        options,
                    );
                }
                /* eslint-enable no-await-in-loop */
            },
        );
    }

    async delete(user: SessionUser, projectUuid: string): Promise<void> {
        const organizationUuid = await this.authorize(user);
        await this.dependencies.projectModel.runInAnalyticsProvisioningLock(
            organizationUuid,
            async () => {
                const projects =
                    await this.dependencies.projectModel.getAllByOrganizationUuid(
                        organizationUuid,
                    );
                const project = projects.find(
                    (candidate) =>
                        candidate.projectUuid === projectUuid &&
                        candidate.provisioningSource === 'analytics',
                );
                if (!project) {
                    throw new NotFoundError('Analytics project not found');
                }
                await this.dependencies.projectService.delete(
                    project.projectUuid,
                    user,
                );
                this.dependencies.userModel.invalidateSessionUserCache(
                    user.userUuid,
                );
            },
        );
    }
}
