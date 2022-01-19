import { subject } from '@casl/ability';
import { Organization } from '../types/organization';
import { defineAbilityForOrganizationMember } from './organizationMemberAbility';
import {
    ORGANIZATION_ADMIN,
    ORGANIZATION_EDITOR,
    ORGANIZATION_VIEWER,
} from './organizationMemberAbility.mock';

describe('Organization member permissions', () => {
    let ability = defineAbilityForOrganizationMember(ORGANIZATION_VIEWER);
    describe('when user is an organization admin', () => {
        beforeEach(() => {
            ability = defineAbilityForOrganizationMember(ORGANIZATION_ADMIN);
        });
        it('can manage organizations', () => {
            expect(ability.can('manage', 'Organization')).toEqual(true);
        });
        it('cannot manage another organization', () => {
            const org: Organization = { organizationUuid: '789' };
            expect(ability.can('manage', subject('Organization', org))).toEqual(
                false,
            );
        });
        it('can manage their own organization', () => {
            const org: Organization = { organizationUuid: '456' };
            expect(ability.can('manage', subject('Organization', org))).toEqual(
                true,
            );
        });
        it('can manage member profiles', () => {
            expect(ability.can('manage', 'OrganizationMemberProfile')).toEqual(
                true,
            );
        });
        it('cannot manage other members from another organization', () => {
            expect(
                ability.can(
                    'manage',
                    subject('OrganizationMemberProfile', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('OrganizationMemberProfile', {
                        organizationUuid: 'notmine',
                    }),
                ),
            ).toEqual(false);
        });
    });

    describe('when user is an editor', () => {
        beforeEach(() => {
            ability = defineAbilityForOrganizationMember(ORGANIZATION_EDITOR);
        });
        it('cannot manage organizations', () => {
            expect(ability.can('manage', 'Organization')).toEqual(false);
        });
        it('cannot view member profiles', () => {
            expect(ability.can('view', 'OrganizationMemberProfile')).toEqual(
                false,
            );
        });
    });
});
