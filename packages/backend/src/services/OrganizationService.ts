import { OrganizationUser, SessionUser } from 'common';
import { NotExistsError } from '../errors';
import { analytics } from '../analytics/client';
import { OrganizationModel } from '../models/OrganizationModel';
import { UserModel } from '../models/UserModel';

type OrganizationServiceDependencies = {
    organizationModel: OrganizationModel;
    userModel: UserModel;
};

export class OrganizationService {
    private readonly organizationModel: OrganizationModel;

    private readonly userModel: UserModel;

    constructor({
        organizationModel,
        userModel,
    }: OrganizationServiceDependencies) {
        this.organizationModel = organizationModel;
        this.userModel = userModel;
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
            properties: {
                organizationUuid,
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
}
