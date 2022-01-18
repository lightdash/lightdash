import {
    defineAbilityForOrganizationMember,
    OrganizationMemberAbility,
} from 'common';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';

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
    ): Promise<OrganizationMemberAbility> {
        const organizationMember =
            await this.organizationMemberProfileModel.findOrganizationMember(
                organizationUuid,
                userUuid,
            );
        const ability = defineAbilityForOrganizationMember(organizationMember);
        return ability;
    }
}
