/* eslint-disable no-console */
import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { OrganizationMemberRole } from '../types/organizationMemberProfile';
import { ProjectMemberRole } from '../types/projectMemberRole';
import { getUserAbilityBuilder } from './index';
import { projectMemberAbilities } from './projectMemberAbility';
import { PROJECT_EDITOR } from './projectMemberAbility.mock';
import {
    getAllScopesForRole,
    getNonEnterpriseScopesForRole,
    isSystemRole,
} from './roleToScopeMapping';
import {
    debugRoleScopeMapping,
    validateRoleInheritance,
} from './roleToScopeMapping.testUtils';
import { buildAbilityFromScopes } from './scopeAbilityBuilder';
import { type MemberAbility } from './types';

describe('roleToScopeMapping', () => {
    describe('isSystemRole', () => {
        it('should return true for valid system role "developer"', () => {
            expect(isSystemRole('developer')).toBe(true);
        });

        it('should return false for invalid role "1234"', () => {
            expect(isSystemRole('1234')).toBe(false);
        });

        it('should return true for all valid ProjectMemberRole values', () => {
            expect(isSystemRole('viewer')).toBe(true);
            expect(isSystemRole('interactive_viewer')).toBe(true);
            expect(isSystemRole('editor')).toBe(true);
            expect(isSystemRole('developer')).toBe(true);
            expect(isSystemRole('admin')).toBe(true);
        });

        it('should return false for invalid strings', () => {
            expect(isSystemRole('')).toBe(false);
            expect(isSystemRole('invalid-role')).toBe(false);
            expect(isSystemRole('custom-uuid-123')).toBe(false);
            expect(isSystemRole('VIEWER')).toBe(false); // Case sensitive
            expect(isSystemRole('Developer')).toBe(false); // Case sensitive
        });

        it('should work as a type guard', () => {
            const roleUuid: string = 'developer';

            if (isSystemRole(roleUuid)) {
                // TypeScript should now know that roleUuid is ProjectMemberRole
                expect(typeof roleUuid).toBe('string');
                expect(roleUuid).toBe('developer');
            } else {
                fail('isSystemRole should return true for "developer"');
            }
        });
    });

    describe('getScopesForRole', () => {
        it('should return scopes for viewer role', () => {
            const scopes = getAllScopesForRole(ProjectMemberRole.VIEWER);
            expect(scopes).toContain('view:Dashboard');
            expect(scopes).toContain('view:SavedChart');
            expect(scopes).toContain('view:Space');
            expect(scopes).toContain('view:Project');
        });

        it('should include inherited scopes for editor role', () => {
            const scopes = getAllScopesForRole(ProjectMemberRole.EDITOR);

            // Should have viewer scopes
            expect(scopes).toContain('view:Dashboard');
            expect(scopes).toContain('view:SavedChart');

            // Should have interactive viewer scopes
            expect(scopes).toContain('view:UnderlyingData');
            expect(scopes).toContain('manage:Explore');

            // Should have editor-specific scopes
            expect(scopes).toContain('create:Space');
            expect(scopes).toContain('manage:DashboardComments');
            expect(scopes).toContain('manage:ScheduledDeliveries');
        });

        it('should have more scopes for higher roles', () => {
            const viewerScopes = getAllScopesForRole(ProjectMemberRole.VIEWER);
            const editorScopes = getAllScopesForRole(ProjectMemberRole.EDITOR);
            const adminScopes = getAllScopesForRole(ProjectMemberRole.ADMIN);

            expect(editorScopes.length).toBeGreaterThan(viewerScopes.length);
            expect(adminScopes.length).toBeGreaterThan(editorScopes.length);
        });
    });

    describe('validateRoleInheritance', () => {
        it('should validate that roles properly inherit permissions', () => {
            const validation = validateRoleInheritance();

            if (!validation.valid) {
                console.debug('Validation errors:', validation.errors);
            }

            expect(validation.valid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });
    });

    describe('debugRoleScopeMapping', () => {
        it('should not throw when debugging editor role', () => {
            expect(() => {
                debugRoleScopeMapping(ProjectMemberRole.EDITOR);
            }).not.toThrow();
        });
    });

    describe('AbilityBuilderCompatibility', () => {});

    describe('Ability builder compatibility', () => {
        it('should build equivalent abilities using scopes vs role-based builder', () => {
            // Build ability using the old role-based system
            const roleBuilder = new AbilityBuilder<MemberAbility>(Ability);
            projectMemberAbilities[ProjectMemberRole.EDITOR](
                PROJECT_EDITOR,
                roleBuilder,
            );
            const roleAbility = roleBuilder.build();

            // Define scopes that should be equivalent to an editor role
            // Based on projectMemberAbility.ts, an editor can:
            // - Do everything interactive_viewer can do (view content, export, create deliveries)
            // - Create spaces
            // - Manage non-private spaces, jobs, pinned items, scheduled deliveries, dashboard comments, tags
            // NOTE: Adding manage:Project to enable managing non-private spaces
            const editorScopes = [
                // Interactive viewer scopes (inherited)
                'view:Dashboard',
                'view:SavedChart',
                'view:Space',
                'view:Project',
                'create:ScheduledDeliveries',
                'view:Job',
                'create:Job',
                'manage:Explore',
                'create:DashboardComments',

                // Editor-specific scopes
                'create:Space',
                'manage:Space',
                'manage:Project', // Required for managing non-private spaces
                'manage:Job',
                'manage:PinnedItems',
                'manage:ScheduledDeliveries',
                'manage:DashboardComments',
                'manage:Tags',
            ];

            // Build ability using the new scope-based system
            const scopeBuilder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(
                {
                    projectUuid: PROJECT_EDITOR.projectUuid,
                    userUuid: PROJECT_EDITOR.userUuid,
                    scopes: editorScopes,
                    isEnterprise: false,
                    organizationRole: 'editor',
                    permissionsConfig: {
                        pat: {
                            enabled: false,
                            allowedOrgRoles: [],
                        },
                    },
                },
                scopeBuilder,
            );
            const scopeAbility = scopeBuilder.build();

            // Test cases that should be equivalent for both abilities
            const testCases = [
                // View permissions (inherited from interactive_viewer)
                {
                    action: 'view' as const,
                    subject: 'Dashboard' as const,
                    resource: {
                        organizationUuid: 'org-uuid-test',
                        projectUuid: PROJECT_EDITOR.projectUuid,
                        isPrivate: false,
                    },
                },
                {
                    action: 'view' as const,
                    subject: 'SavedChart' as const,
                    resource: {
                        organizationUuid: 'org-uuid-test',
                        projectUuid: PROJECT_EDITOR.projectUuid,
                        isPrivate: false,
                    },
                },
                {
                    action: 'view' as const,
                    subject: 'Space' as const,
                    resource: {
                        organizationUuid: 'org-uuid-test',
                        projectUuid: PROJECT_EDITOR.projectUuid,
                        isPrivate: false,
                    },
                },

                // Create permissions (editor-specific)
                {
                    action: 'create' as const,
                    subject: 'Space' as const,
                    resource: {
                        organizationUuid: 'org-uuid-test',
                        projectUuid: PROJECT_EDITOR.projectUuid,
                    },
                },

                // Manage permissions (editor-specific)
                {
                    action: 'manage' as const,
                    subject: 'Space' as const,
                    resource: {
                        organizationUuid: 'org-uuid-test',
                        projectUuid: PROJECT_EDITOR.projectUuid,
                        isPrivate: false,
                    },
                },
                {
                    action: 'manage' as const,
                    subject: 'Job' as const,
                    resource: {},
                },
                {
                    action: 'manage' as const,
                    subject: 'PinnedItems' as const,
                    resource: {
                        organizationUuid: 'org-uuid-test',
                        projectUuid: PROJECT_EDITOR.projectUuid,
                    },
                },
                {
                    action: 'manage' as const,
                    subject: 'ScheduledDeliveries' as const,
                    resource: {
                        organizationUuid: 'org-uuid-test',
                        projectUuid: PROJECT_EDITOR.projectUuid,
                    },
                },
                {
                    action: 'manage' as const,
                    subject: 'DashboardComments' as const,
                    resource: {
                        organizationUuid: 'org-uuid-test',
                        projectUuid: PROJECT_EDITOR.projectUuid,
                    },
                },
                {
                    action: 'manage' as const,
                    subject: 'Tags' as const,
                    resource: {
                        organizationUuid: 'org-uuid-test',
                        projectUuid: PROJECT_EDITOR.projectUuid,
                    },
                },
            ];

            // Verify that both ability builders produce the same results
            testCases.forEach(({ action, subject: subjectType, resource }) => {
                const subjectWithResource = subject(subjectType, resource);
                const roleResult = roleAbility.can(action, subjectWithResource);
                const scopeResult = scopeAbility.can(
                    action,
                    subjectWithResource,
                );

                expect(scopeResult).toBe(roleResult);
            });
        });

        it('should deny the same permissions for both abilities', () => {
            // Build abilities
            const roleBuilder = new AbilityBuilder<MemberAbility>(Ability);
            projectMemberAbilities[ProjectMemberRole.EDITOR](
                PROJECT_EDITOR,
                roleBuilder,
            );
            const roleAbility = roleBuilder.build();

            const editorScopes = [
                'view:Dashboard',
                'view:SavedChart',
                'view:Space',
                'view:Project',
                'create:ScheduledDeliveries',
                'view:Job',
                'create:Job',
                'manage:Explore',
                'create:DashboardComments',
                'create:Space',
                'manage:Job',
                'manage:PinnedItems',
                'manage:ScheduledDeliveries',
                'manage:DashboardComments',
                'manage:Tags',
            ];

            const scopeBuilder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(
                {
                    projectUuid: PROJECT_EDITOR.projectUuid,
                    userUuid: PROJECT_EDITOR.userUuid,
                    scopes: editorScopes,
                    isEnterprise: false,
                    organizationRole: 'editor',
                    permissionsConfig: {
                        pat: {
                            enabled: false,
                            allowedOrgRoles: [],
                        },
                    },
                },
                scopeBuilder,
            );
            const scopeAbility = scopeBuilder.build();

            // Test cases that should be denied for both abilities (editor limitations)
            const deniedTestCases = [
                // Cannot manage project (developer+ only)
                {
                    action: 'manage' as const,
                    subject: 'Project' as const,
                    resource: { projectUuid: PROJECT_EDITOR.projectUuid },
                },
                // Cannot manage validations (developer+ only)
                {
                    action: 'manage' as const,
                    subject: 'Validation' as const,
                    resource: { projectUuid: PROJECT_EDITOR.projectUuid },
                },
                // Cannot manage virtual views (developer+ only)
                {
                    action: 'manage' as const,
                    subject: 'VirtualView' as const,
                    resource: { projectUuid: PROJECT_EDITOR.projectUuid },
                },
            ];

            // Verify that both ability builders deny the same permissions
            deniedTestCases.forEach(
                ({ action, subject: subjectType, resource }) => {
                    const subjectWithResource = subject(subjectType, resource);
                    const roleResult = roleAbility.can(
                        action,
                        subjectWithResource,
                    );
                    const scopeResult = scopeAbility.can(
                        action,
                        subjectWithResource,
                    );

                    expect(scopeResult).toBe(roleResult);
                    expect(roleResult).toBe(false); // Ensure they're both false
                },
            );
        });
    });

    describe('Convert all project member roles to scopes', () => {
        const testCases = [
            {
                action: 'view',
                subject: 'Dashboard',
                resource: {
                    organizationUuid: 'org-uuid-test',
                    projectUuid: 'test-project-uuid',
                    isPrivate: false,
                },
            },
            {
                action: 'create',
                subject: 'Space',
                resource: {
                    organizationUuid: 'org-uuid-test',
                    projectUuid: 'test-project-uuid',
                },
            },
            {
                action: 'manage',
                subject: 'Space',
                resource: {
                    organizationUuid: 'org-uuid-test',
                    projectUuid: 'test-project-uuid',
                    isPrivate: false,
                },
            },
            {
                action: 'manage',
                subject: 'Project',
                resource: { projectUuid: 'test-project-uuid' },
            },
            {
                action: 'view',
                subject: 'Analytics',
                resource: { projectUuid: 'test-project-uuid' },
            },
        ] as const;

        const roles = [
            ProjectMemberRole.VIEWER,
            ProjectMemberRole.INTERACTIVE_VIEWER,
            ProjectMemberRole.EDITOR,
            ProjectMemberRole.DEVELOPER,
            ProjectMemberRole.ADMIN,
        ];

        roles.forEach((role) => {
            it(`should have equivalent CASL abilities for ${role} role`, () => {
                // Build role-based ability
                const roleBuilder = new AbilityBuilder<MemberAbility>(Ability);
                const testMember = {
                    role,
                    projectUuid: PROJECT_EDITOR.projectUuid,
                    userUuid: PROJECT_EDITOR.userUuid,
                };
                projectMemberAbilities[role](testMember, roleBuilder);
                const roleAbility = roleBuilder.build();

                // Build scope-based ability
                const scopes = getNonEnterpriseScopesForRole(role);
                const scopeBuilder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        projectUuid: PROJECT_EDITOR.projectUuid,
                        userUuid: PROJECT_EDITOR.userUuid,
                        scopes,
                        isEnterprise: false,
                        organizationRole: 'editor',
                        permissionsConfig: {
                            pat: {
                                enabled: false,
                                allowedOrgRoles: [],
                            },
                        },
                    },
                    scopeBuilder,
                );
                const scopeAbility = scopeBuilder.build();

                // Test key permissions for each role - assert strict equivalence
                testCases.forEach((testCase) => {
                    const subjectWithResource = subject(
                        testCase.subject,
                        testCase.resource,
                    );
                    const roleResult = roleAbility.can(
                        testCase.action,
                        subjectWithResource,
                    );
                    const scopeResult = scopeAbility.can(
                        testCase.action,
                        subjectWithResource,
                    );

                    // Assert that both systems return the same result with detailed context
                    if (scopeResult !== roleResult) {
                        throw new Error(
                            `Permission mismatch for ${role} role:\n` +
                                `  Action: ${testCase.action}\n` +
                                `  Subject: ${testCase.subject}\n` +
                                `  Resource: ${JSON.stringify(
                                    testCase.resource,
                                    null,
                                    2,
                                )}\n` +
                                `  Role-based result: ${roleResult}\n` +
                                `  Scope-based result: ${scopeResult}\n` +
                                `  Expected: Both systems should return ${roleResult}`,
                        );
                    }

                    expect(scopeResult).toBe(roleResult);
                });
            });
        });
    });

    describe('Combined Organization and Project Roles', () => {
        const testCases = [
            {
                action: 'view',
                subject: 'Dashboard',
                resource: {
                    organizationUuid: 'org-uuid-test',
                    projectUuid: 'project-uuid-test',
                    isPrivate: false,
                },
            },
            {
                action: 'create',
                subject: 'Space',
                resource: {
                    organizationUuid: 'org-uuid-test',
                    projectUuid: 'project-uuid-test',
                },
            },
            {
                action: 'manage',
                subject: 'Space',
                resource: {
                    organizationUuid: 'org-uuid-test',
                    projectUuid: 'project-uuid-test',
                    isPrivate: false,
                },
            },
            {
                action: 'manage',
                subject: 'Project',
                resource: { projectUuid: 'project-uuid-test' },
            },
            {
                action: 'manage',
                subject: 'Validation',
                resource: { projectUuid: 'project-uuid-test' },
            },
            {
                action: 'view',
                subject: 'Analytics',
                resource: { projectUuid: 'project-uuid-test' },
            },
        ] as const;

        const roleCombinations = [
            {
                description: 'viewer org + viewer project',
                orgRole: OrganizationMemberRole.VIEWER,
                projectRole: ProjectMemberRole.VIEWER,
            },
            {
                description: 'viewer org + developer project',
                orgRole: OrganizationMemberRole.VIEWER,
                projectRole: ProjectMemberRole.DEVELOPER,
            },
            {
                description: 'editor org + developer project',
                orgRole: OrganizationMemberRole.EDITOR,
                projectRole: ProjectMemberRole.DEVELOPER,
            },
            {
                description: 'developer org + admin project',
                orgRole: OrganizationMemberRole.DEVELOPER,
                projectRole: ProjectMemberRole.ADMIN,
            },
            {
                description: 'viewer org + admin project',
                orgRole: OrganizationMemberRole.VIEWER,
                projectRole: ProjectMemberRole.ADMIN,
            },
        ];

        roleCombinations.forEach(({ description, orgRole, projectRole }) => {
            it(`should have equivalent abilities for ${description}`, () => {
                const user = {
                    role: orgRole,
                    organizationUuid: 'org-uuid-test',
                    userUuid: 'user-uuid-test',
                    roleUuid: undefined,
                };

                const projectProfiles = [
                    {
                        projectUuid: 'project-uuid-test',
                        role: projectRole,
                        userUuid: 'user-uuid-test',
                        roleUuid: undefined,
                    },
                ];

                // Build ability using the combined role-based system
                const roleBasedBuilder = getUserAbilityBuilder({
                    user,
                    projectProfiles,
                    permissionsConfig: {
                        pat: {
                            enabled: false,
                            allowedOrgRoles: [],
                        },
                    },
                    customRoleScopes: {},
                    customRolesEnabled: false,
                    isEnterprise: false,
                });
                const roleBasedAbility = roleBasedBuilder.build();

                // Build equivalent scope-based ability
                // Convert OrganizationMemberRole to ProjectMemberRole for scope mapping
                // Note: This is a simplification - in reality, org roles may have different scope mappings
                const orgRoleAsProjectRole =
                    orgRole as unknown as ProjectMemberRole;
                const orgScopes =
                    getNonEnterpriseScopesForRole(orgRoleAsProjectRole);
                const projectScopes =
                    getNonEnterpriseScopesForRole(projectRole);
                const allScopes = [
                    ...new Set([...orgScopes, ...projectScopes]),
                ]; // Remove duplicates

                const scopeBuilder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        organizationUuid: 'org-uuid-test',
                        userUuid: 'user-uuid-test',
                        scopes: orgScopes,
                        isEnterprise: false,
                        organizationRole: orgRole,
                        permissionsConfig: {
                            pat: {
                                enabled: false,
                                allowedOrgRoles: [],
                            },
                        },
                    },
                    scopeBuilder,
                );
                buildAbilityFromScopes(
                    {
                        projectUuid: projectProfiles[0].projectUuid,
                        userUuid: 'user-uuid-test',
                        scopes: projectScopes,
                        isEnterprise: false,
                        organizationRole: orgRole,
                        permissionsConfig: {
                            pat: {
                                enabled: false,
                                allowedOrgRoles: [],
                            },
                        },
                    },
                    scopeBuilder,
                );
                const scopeBasedAbility = scopeBuilder.build();

                // Test each permission combination
                testCases.forEach((testCase) => {
                    const subjectWithResource = subject(
                        testCase.subject,
                        testCase.resource,
                    );
                    const roleBasedResult = roleBasedAbility.can(
                        testCase.action,
                        subjectWithResource,
                    );
                    const scopeBasedResult = scopeBasedAbility.can(
                        testCase.action,
                        subjectWithResource,
                    );

                    // Provide detailed error information for mismatches
                    if (roleBasedResult !== scopeBasedResult) {
                        throw new Error(
                            `Permission mismatch for ${description}:\n` +
                                `  Action: ${testCase.action}\n` +
                                `  Subject: ${testCase.subject}\n` +
                                `  Resource: ${JSON.stringify(
                                    testCase.resource,
                                    null,
                                    2,
                                )}\n` +
                                `  Role-based result: ${roleBasedResult}\n` +
                                `  Scope-based result: ${scopeBasedResult}\n` +
                                `  Organization role: ${orgRole}\n` +
                                `  Project role: ${projectRole}\n` +
                                `  Combined scopes: ${allScopes.length} scopes\n` +
                                `  Expected: Both systems should return ${roleBasedResult}`,
                        );
                    }

                    expect(scopeBasedResult).toBe(roleBasedResult);
                });
            });
        });
    });
});
