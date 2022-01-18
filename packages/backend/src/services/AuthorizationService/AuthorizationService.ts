import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import {
    getAdminAbility,
    getNoAbility,
    LightdashAbility,
} from './organizationMemberAbilities';

type AuthorizationServiceDependencies = {
    organizationMemberProfileModel: OrganizationMemberProfileModel;
};

export class AuthorizationService {
    private readonly organizationMemberProfileModel: OrganizationMemberProfileModel;

    constructor(dependencies: AuthorizationServiceDependencies) {
        this.organizationMemberProfileModel =
            dependencies.organizationMemberProfileModel;
    }

    async getOrganizationMemberAbilities(
        organizationUuid: string,
        userUuid: string,
    ): Promise<LightdashAbility> {
        const organizationMember =
            await this.organizationMemberProfileModel.findOrganizationMember(
                organizationUuid,
                userUuid,
            );
        switch (organizationMember?.role) {
            case 'admin':
                return getAdminAbility();
            case 'editor':
            case 'viewer':
            default:
                return getNoAbility();
        }
    }
}
