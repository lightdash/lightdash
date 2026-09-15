import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { ServiceAccountScope } from '../ee/serviceAccounts/types';
import { ProjectMemberRole } from '../types/projectMemberRole';
import { SpaceMemberRole } from '../types/space';
import { applyOrganizationMemberStaticAbilities } from './organizationMemberAbility';
import { projectMemberAbilities } from './projectMemberAbility';
import { getAllScopesForRole } from './roleToScopeMapping';
import { buildAbilityFromScopes } from './scopeAbilityBuilder';
import { applyServiceAccountAbilities } from './serviceAccountAbility';
import { type MemberAbility } from './types';

const userUuid = 'document-reader';
const projectUuid = 'document-project';
const organizationUuid = 'document-organization';

const documentSubject = (overrides: Record<string, unknown> = {}) =>
    subject('Document', {
        projectUuid,
        organizationUuid,
        inheritsFromOrgOrProject: false,
        access: [],
        ...overrides,
    });

describe('Document authorization', () => {
    describe.each(['project', 'organization'] as const)('%s roles', (level) => {
        test.each(Object.values(ProjectMemberRole))(
            '%s matches its custom-role scopes for document access',
            (role) => {
                const systemBuilder = new AbilityBuilder<MemberAbility>(
                    Ability,
                );
                const scopeBuilder = new AbilityBuilder<MemberAbility>(Ability);
                if (level === 'project') {
                    projectMemberAbilities[role](
                        { userUuid, projectUuid, role },
                        systemBuilder,
                    );
                } else {
                    applyOrganizationMemberStaticAbilities[role](
                        { userUuid, organizationUuid },
                        systemBuilder,
                    );
                }
                buildAbilityFromScopes(
                    {
                        ...(level === 'project'
                            ? { projectUuid }
                            : { organizationUuid }),
                        userUuid,
                        scopes: getAllScopesForRole(role),
                        isEnterprise: false,
                    },
                    scopeBuilder,
                );
                const system = systemBuilder.build();
                const custom = scopeBuilder.build();
                const resources = [
                    documentSubject(),
                    documentSubject({ inheritsFromOrgOrProject: true }),
                    ...Object.values(SpaceMemberRole).map((spaceRole) =>
                        documentSubject({
                            access: [{ userUuid, role: spaceRole }],
                        }),
                    ),
                    documentSubject({
                        access: [
                            {
                                userUuid: 'someone-else',
                                role: SpaceMemberRole.ADMIN,
                            },
                        ],
                    }),
                    documentSubject({
                        projectUuid: 'other-project',
                        organizationUuid: 'other-organization',
                        inheritsFromOrgOrProject: true,
                        access: [{ userUuid, role: SpaceMemberRole.ADMIN }],
                    }),
                ];
                resources.forEach((resource) => {
                    (
                        [
                            'view',
                            'manage',
                            'create',
                            'update',
                            'delete',
                        ] as const
                    ).forEach((action) => {
                        expect(custom.can(action, resource)).toBe(
                            system.can(action, resource),
                        );
                    });
                });
                expect(
                    system.can('view', resources[resources.length - 1]),
                ).toBe(false);
            },
        );
    });

    test('view scope permits inherited or explicitly granted access but never edits or creator access', () => {
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        buildAbilityFromScopes(
            {
                projectUuid,
                userUuid,
                scopes: ['view:Document'],
                isEnterprise: false,
            },
            builder,
        );
        const ability = builder.build();
        expect(
            ability.can(
                'view',
                documentSubject({ inheritsFromOrgOrProject: true }),
            ),
        ).toBe(true);
        expect(
            ability.can(
                'view',
                documentSubject({
                    access: [
                        {
                            userUuid,
                            role: SpaceMemberRole.VIEWER,
                            grantedVia: 'document',
                        },
                    ],
                }),
            ),
        ).toBe(true);
        expect(
            ability.can(
                'view',
                documentSubject({ createdByUserUuid: userUuid }),
            ),
        ).toBe(false);
        expect(
            ability.can(
                'manage',
                documentSubject({
                    access: [{ userUuid, role: SpaceMemberRole.ADMIN }],
                }),
            ),
        ).toBe(false);
    });

    test('unrelated chart and dashboard scopes do not grant document access', () => {
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        buildAbilityFromScopes(
            {
                projectUuid,
                userUuid,
                scopes: ['manage:Dashboard', 'manage:SavedChart'],
                isEnterprise: false,
            },
            builder,
        );
        expect(
            builder
                .build()
                .can(
                    'view',
                    documentSubject({ inheritsFromOrgOrProject: true }),
                ),
        ).toBe(false);
    });

    test.each([
        [ServiceAccountScope.ORG_READ, false],
        [ServiceAccountScope.ORG_EDIT, true],
        [ServiceAccountScope.ORG_ADMIN, true],
    ] as const)(
        'legacy service-account scope %s has bounded document access',
        (scope, canManage) => {
            const builder = new AbilityBuilder<MemberAbility>(Ability);
            applyServiceAccountAbilities({
                organizationUuid,
                userUuid,
                scopes: [scope],
                builder,
            });
            const ability = builder.build();
            expect(ability.can('view', documentSubject())).toBe(true);
            expect(ability.can('manage', documentSubject())).toBe(canManage);
            expect(
                ability.can(
                    'view',
                    documentSubject({ organizationUuid: 'other-organization' }),
                ),
            ).toBe(false);
        },
    );
});
