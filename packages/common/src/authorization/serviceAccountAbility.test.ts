import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { ServiceAccountScope } from '../ee/serviceAccounts/types';
import { applyServiceAccountAbilities } from './serviceAccountAbility';
import { type MemberAbility } from './types';

const buildAbility = (scopes: ServiceAccountScope[]) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    applyServiceAccountAbilities({
        organizationUuid: 'org-1',
        userUuid: 'sa-user-1',
        builder,
        scopes,
    });
    return builder.build();
};

describe('ServiceAccountScope.SYSTEM_MEMBER', () => {
    it('grants the same abilities as a human Member', () => {
        const ability = buildAbility([ServiceAccountScope.SYSTEM_MEMBER]);
        expect(
            ability.can(
                'view',
                subject('OrganizationMemberProfile', {
                    organizationUuid: 'org-1',
                }),
            ),
        ).toBe(true);
        expect(
            ability.can(
                'view',
                subject('PinnedItems', { organizationUuid: 'org-1' }),
            ),
        ).toBe(true);
    });

    it('grants no org-wide content abilities', () => {
        const ability = buildAbility([ServiceAccountScope.SYSTEM_MEMBER]);
        expect(
            ability.can(
                'view',
                subject('Dashboard', {
                    organizationUuid: 'org-1',
                    inheritsFromOrgOrProject: true,
                }),
            ),
        ).toBe(false);
        expect(
            ability.can(
                'view',
                subject('Project', { organizationUuid: 'org-1' }),
            ),
        ).toBe(false);
    });
});
