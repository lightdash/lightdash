import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { ServiceAccountScope } from '../ee/serviceAccounts/types';
import { OrganizationMemberRole } from '../types/organizationMemberProfile';
import { ProjectMemberRole } from '../types/projectMemberRole';
import { getUserAbilityBuilder } from './index';
import { buildAbilityFromScopes } from './scopeAbilityBuilder';
import { applyServiceAccountAbilities } from './serviceAccountAbility';
import { type MemberAbility } from './types';

const scopeContext = { userUuid: 'user', isEnterprise: true };

const target = subject('SystemAnalytics', {
    organizationUuid: 'org',
    projectUuid: 'analytics',
});
const permissionsConfig = { pat: { enabled: false, allowedOrgRoles: [] } };

describe('managed analytics custom permission', () => {
    it.each(['project', 'organization'] as const)(
        'grants read access at %s level without organization administration',
        (level) => {
            const builder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(
                {
                    ...scopeContext,
                    ...(level === 'project'
                        ? { projectUuid: 'analytics' }
                        : { organizationUuid: 'org' }),
                    scopes: ['view:Project', 'view:SystemAnalytics'],
                },
                builder,
            );
            const ability = builder.build();
            expect(ability.can('view', target)).toBe(true);
            expect(
                ability.can(
                    'view',
                    subject('SystemAnalytics', {
                        projectUuid: 'other-project',
                        organizationUuid: 'other-org',
                    }),
                ),
            ).toBe(false);
            expect(
                ability.can(
                    'manage',
                    subject('Organization', { organizationUuid: 'org' }),
                ),
            ).toBe(false);
            expect(
                ability.can(
                    'manage',
                    subject('Project', {
                        projectUuid: 'analytics',
                        organizationUuid: 'org',
                    }),
                ),
            ).toBe(false);
            expect(
                ability.can(
                    'manage',
                    subject('Explore', {
                        projectUuid: 'analytics',
                        organizationUuid: 'org',
                    }),
                ),
            ).toBe(false);
        },
    );

    it('allows organization admins to delegate the managed analytics scope', () => {
        const ability = getUserAbilityBuilder({
            user: {
                userUuid: 'admin',
                organizationUuid: 'org',
                role: OrganizationMemberRole.ADMIN,
            },
            projectProfiles: [],
            permissionsConfig,
        }).builder.build();
        expect(ability.can('view', target)).toBe(true);
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        applyServiceAccountAbilities({
            scopes: [ServiceAccountScope.ORG_ADMIN],
            organizationUuid: 'org',
            userUuid: 'service-account-admin',
            builder,
        });
        expect(builder.build().can('view', target)).toBe(true);
        expect(
            builder.build().can(
                'view',
                subject('SystemAnalytics', {
                    organizationUuid: 'other-org',
                    projectUuid: 'other-project',
                }),
            ),
        ).toBe(false);
    });

    it('unions explicit project grants and removes access when the last grant is revoked', () => {
        const build = (extraRoleUuids: string[]) =>
            getUserAbilityBuilder({
                user: {
                    userUuid: 'user',
                    organizationUuid: 'org',
                    role: OrganizationMemberRole.MEMBER,
                },
                projectProfiles: [
                    {
                        projectUuid: 'analytics',
                        userUuid: 'user',
                        role: ProjectMemberRole.VIEWER,
                        roleUuid: undefined,
                        extraRoleUuids,
                    },
                ],
                customRoleScopes: {
                    direct: ['view:SystemAnalytics'],
                    group: ['view:SystemAnalytics'],
                },
                customRolesEnabled: true,
                permissionsConfig,
            }).builder.build();
        expect(build(['direct', 'group']).can('view', target)).toBe(true);
        expect(build(['group']).can('view', target)).toBe(true);
        expect(build([]).can('view', target)).toBe(false);
    });

    it.each([
        OrganizationMemberRole.VIEWER,
        OrganizationMemberRole.INTERACTIVE_VIEWER,
        OrganizationMemberRole.EDITOR,
        OrganizationMemberRole.DEVELOPER,
    ])('does not opt %s users in by default', (role) => {
        const ability = getUserAbilityBuilder({
            user: { userUuid: 'user', organizationUuid: 'org', role },
            projectProfiles: [
                {
                    projectUuid: 'analytics',
                    userUuid: 'user',
                    role: ProjectMemberRole.ADMIN,
                    roleUuid: undefined,
                },
            ],
            permissionsConfig,
        }).builder.build();
        expect(ability.can('view', target)).toBe(false);
        expect(
            ability.can(
                'manage',
                subject('Organization', { organizationUuid: 'org' }),
            ),
        ).toBe(false);
    });

    it('keeps legacy analytics separate and supports an explicit service-account grant', () => {
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        applyServiceAccountAbilities({
            scopes: [ServiceAccountScope.ORG_READ],
            organizationUuid: 'org',
            userUuid: 'service-account-user',
            builder,
        });
        buildAbilityFromScopes(
            {
                ...scopeContext,
                projectUuid: 'analytics',
                scopes: ['view:Analytics'],
            },
            builder,
        );
        expect(builder.build().can('view', target)).toBe(false);
        buildAbilityFromScopes(
            {
                ...scopeContext,
                projectUuid: 'analytics',
                scopes: ['view:SystemAnalytics'],
            },
            builder,
        );
        expect(builder.build().can('view', target)).toBe(true);
        expect(
            builder
                .build()
                .can(
                    'manage',
                    subject('Organization', { organizationUuid: 'org' }),
                ),
        ).toBe(false);
    });
});
