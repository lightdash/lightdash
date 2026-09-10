import {
    AnalyticsProjectStatus,
    EnsureAnalyticsProjectResult,
    ForbiddenError,
    isUserWithOrg,
    NotFoundError,
    SessionUser,
} from '@lightdash/common';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';
import { ProjectService } from '../ProjectService/ProjectService';

type Dependencies = {
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
        return this.dependencies.projectService.ensureAnalyticsProject(user);
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
