import { SessionUser } from 'common';
import { NotExistsError } from '../errors';
import { analytics } from '../analytics/client';
import { OrganizationModel } from '../models/OrganizationModel';

type OrganizationServiceDependencies = {
    organizationModel: OrganizationModel;
};

export class OrganizationService {
    private organizationModel: OrganizationModel;

    constructor({ organizationModel }: OrganizationServiceDependencies) {
        this.organizationModel = organizationModel;
    }

    async updateOrg(
        user: SessionUser,
        data: { organizationName: string },
    ): Promise<void> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        await this.organizationModel.update(organizationUuid, data);
        analytics.track({
            userId: user.userUuid,
            event: 'organization.updated',
        });
    }
}
