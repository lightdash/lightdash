import { OrganizationProject, OrganizationUser, SessionUser } from 'common';
import { NotExistsError } from '../errors';
import { analytics } from '../analytics/client';
import { OrganizationModel } from '../models/OrganizationModel';
import { UserModel } from '../models/UserModel';
import { ProjectModel } from '../models/ProjectModel';

type OrganizationServiceDependencies = {
    organizationModel: OrganizationModel;
    userModel: UserModel;
    projectModel: ProjectModel;
};

export class OrganizationService {
    private readonly organizationModel: OrganizationModel;

    private readonly userModel: UserModel;

    private readonly projectModel: ProjectModel;

    constructor({
        organizationModel,
        userModel,
        projectModel,
    }: OrganizationServiceDependencies) {
        this.organizationModel = organizationModel;
        this.userModel = userModel;
        this.projectModel = projectModel;
    }

    async updateOrg(
        user: SessionUser,
        data: { organizationName: string },
    ): Promise<void> {
        const { organizationUuid, organizationName } = user;
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        await this.organizationModel.update(organizationUuid, data);
        analytics.track({
            userId: user.userUuid,
            event: 'organization.updated',
            organizationId: organizationUuid,
            properties: {
                organizationId: organizationUuid,
                organizationName,
            },
        });
    }

    async getUsers(user: SessionUser): Promise<OrganizationUser[]> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        const users = await this.userModel.getAllByOrganization(
            organizationUuid,
        );

        return users.map(({ user_uuid, first_name, last_name, email }) => ({
            userUuid: user_uuid,
            firstName: first_name,
            lastName: last_name,
            email,
        }));
    }

    async getProjects(user: SessionUser): Promise<OrganizationProject[]> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        return this.projectModel.getAllByOrganizationUuid(organizationUuid);
    }
}
