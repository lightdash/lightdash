import { Ability, AbilityBuilder, subject } from '@casl/ability';
import {
    ContentScope,
    ProjectScope,
    ScimScope,
    type ServiceAccountScope,
} from '../ee/serviceAccounts/scopes';
import { ProjectType } from '../types/projects';
import { applyServiceAccountAbilities } from './serviceAccountAbility';
import { type MemberAbility } from './types';

const defineAbilityForServiceAccount = (
    organizationUuid: string,
    scopes: ServiceAccountScope[],
): MemberAbility => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    applyServiceAccountAbilities({
        organizationUuid,
        builder,
        scopes,
    });
    return builder.build();
};

describe('serviceAccountAbility', () => {
    const organizationUuid = 'test-org-uuid';

    describe('ProjectScope.MANAGE', () => {
        let ability: MemberAbility;

        beforeEach(() => {
            ability = defineAbilityForServiceAccount(organizationUuid, [
                ProjectScope.MANAGE,
            ]);
        });

        it('should manage Jobs', () => {
            expect(ability.can('manage', 'Job')).toBe(true);
            expect(ability.can('view', 'Job')).toBe(true);
            expect(ability.can('update', 'Job')).toBe(true);
            expect(ability.can('create', 'Job')).toBe(true);
        });

        it('should allow project compilation', () => {
            expect(
                ability.can(
                    'manage',
                    subject('CompileProject', { organizationUuid }),
                ),
            ).toBe(true);
        });

        it('should allow project creation', () => {
            expect(
                ability.can(
                    'create',
                    subject('Project', {
                        organizationUuid,
                        type: ProjectType.PREVIEW,
                    }),
                ),
            ).toBe(true);

            expect(
                ability.can(
                    'create',
                    subject('Project', {
                        organizationUuid,
                        type: ProjectType.DEFAULT,
                    }),
                ),
            ).toBe(true);
        });

        it('should allow project updates and deletion', () => {
            expect(
                ability.can('update', subject('Project', { organizationUuid })),
            ).toBe(true);

            expect(
                ability.can('delete', subject('Project', { organizationUuid })),
            ).toBe(true);
        });

        it('should allow viewing job status', () => {
            expect(
                ability.can('view', subject('JobStatus', { organizationUuid })),
            ).toBe(true);
        });

        it('should not allow content management', () => {
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', { organizationUuid }),
                ),
            ).toBe(false);
        });
    });

    describe('ContentScope.MANAGE', () => {
        let ability: MemberAbility;

        beforeEach(() => {
            ability = defineAbilityForServiceAccount(organizationUuid, [
                ContentScope.MANAGE,
            ]);
        });

        it('should allow full content management', () => {
            expect(
                ability.can('view', subject('Dashboard', { organizationUuid })),
            ).toBe(true);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', { organizationUuid }),
                ),
            ).toBe(true);
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', { organizationUuid }),
                ),
            ).toBe(true);
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', { organizationUuid }),
                ),
            ).toBe(true);
        });

        it('should allow space management', () => {
            expect(
                ability.can('view', subject('Space', { organizationUuid })),
            ).toBe(true);
            expect(
                ability.can('manage', subject('Space', { organizationUuid })),
            ).toBe(true);
        });

        it('should allow content-as-code management', () => {
            expect(
                ability.can(
                    'manage',
                    subject('ContentAsCode', { organizationUuid }),
                ),
            ).toBe(true);
        });

        it('should allow tags and pinned items management', () => {
            expect(
                ability.can('manage', subject('Tags', { organizationUuid })),
            ).toBe(true);
            expect(
                ability.can(
                    'manage',
                    subject('PinnedItems', { organizationUuid }),
                ),
            ).toBe(true);
        });

        it('should not allow project compilation', () => {
            expect(
                ability.can(
                    'manage',
                    subject('CompileProject', { organizationUuid }),
                ),
            ).toBe(false);
        });
    });

    describe('ScimScope.MANAGE', () => {
        let ability: MemberAbility;

        beforeEach(() => {
            ability = defineAbilityForServiceAccount(organizationUuid, [
                ScimScope.MANAGE,
            ]);
        });

        it('should be handled by specific SCIM logic', () => {
            // ScimScope.MANAGE currently has empty implementation
            // This test ensures the scope is processed without errors
            expect(ability).toBeDefined();
        });
    });

    describe('Multiple scopes combination', () => {
        it('should combine abilities from multiple scopes', () => {
            const ability = defineAbilityForServiceAccount(organizationUuid, [
                ProjectScope.MANAGE,
                ContentScope.MANAGE,
            ]);

            expect(
                ability.can('view', subject('Project', { organizationUuid })),
            ).toBe(true);
            expect(
                ability.can('view', subject('Dashboard', { organizationUuid })),
            ).toBe(true);
            expect(
                ability.can(
                    'manage',
                    subject('CompileProject', { organizationUuid }),
                ),
            ).toBe(true);
        });

        it('should support content management without deployment', () => {
            const ability = defineAbilityForServiceAccount(organizationUuid, [
                ContentScope.MANAGE,
            ]);

            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', { organizationUuid }),
                ),
            ).toBe(true);
            expect(
                ability.can(
                    'manage',
                    subject('CompileProject', { organizationUuid }),
                ),
            ).toBe(false);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty scopes array', () => {
            const ability = defineAbilityForServiceAccount(
                organizationUuid,
                [],
            );

            expect(
                ability.can('view', subject('Project', { organizationUuid })),
            ).toBe(false);
            expect(
                ability.can('view', subject('Dashboard', { organizationUuid })),
            ).toBe(false);
        });

        it('should handle wrong organization UUID', () => {
            const ability = defineAbilityForServiceAccount(organizationUuid, [
                ProjectScope.MANAGE,
            ]);

            expect(
                ability.can(
                    'manage',
                    subject('CompileProject', {
                        organizationUuid: 'different-org-uuid',
                    }),
                ),
            ).toBe(false);
        });

        it('should properly scope abilities to organization', () => {
            const ability = defineAbilityForServiceAccount(organizationUuid, [
                ContentScope.MANAGE,
            ]);

            // Should work with correct org UUID
            expect(
                ability.can('view', subject('Dashboard', { organizationUuid })),
            ).toBe(true);

            // Should not work with different org UUID
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: 'other-org-uuid',
                    }),
                ),
            ).toBe(false);
        });
    });
});
