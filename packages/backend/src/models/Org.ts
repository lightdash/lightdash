import { updateOrganization } from '../database/entities/organizations';
import { NotExistsError } from '../errors';

export const OrgModel = {
    updateOrg: async (
        organizationUuid: string | undefined,
        data: {
            organizationName: string;
        },
    ): Promise<void> => {
        if (!organizationUuid) {
            throw new NotExistsError('Organization not found');
        }
        await updateOrganization(organizationUuid, {
            organization_name: data.organizationName,
        });
    },
};
