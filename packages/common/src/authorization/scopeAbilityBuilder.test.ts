import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { ProjectType } from '../types/projects';
import { SpaceMemberRole } from '../types/space';
import { buildAbilityFromScopes } from './scopeAbilityBuilder';
import { type MemberAbility } from './types';

describe('scopeAbilityBuilder', () => {
    describe('buildAbilityFromScopes', () => {
        const baseContext = {
            isEnterprise: false,
            organizationRole: 'admin',
            projectUuid: 'project-123',
            userUuid: 'user1',
            scopes: [],
        };

        const baseContextWithOrg = {
            ...baseContext,
            projectUuid: undefined,
            organizationUuid: 'org-123',
        };

        it('should build ability with organization view permissions', () => {
            const builder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(
                {
                    ...baseContextWithOrg,
                    scopes: ['view:Organization'],
                },
                builder,
            );
            const ability = builder.build();

            expect(
                ability.can(
                    'view',
                    subject('Organization', {
                        organizationUuid: 'org-123',
                        projectUuid: 'project-123',
                    }),
                ),
            ).toBe(true);

            expect(
                ability.can(
                    'view',
                    subject('Organization', {
                        organizationUuid: 'different-org',
                        projectUuid: 'project-123',
                    }),
                ),
            ).toBe(false);
        });

        it('should build ability with dashboard view permissions', () => {
            const builder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(
                {
                    ...baseContext,
                    scopes: ['view:Dashboard'],
                },
                builder,
            );
            const ability = builder.build();

            // Should be able to view public dashboards
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: 'org-123',
                        projectUuid: 'project-123',
                        isPrivate: false,
                    }),
                ),
            ).toBe(true);

            // Should not be able to view private dashboards without user context
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: 'org-123',
                        projectUuid: 'project-123',
                        isPrivate: true,
                    }),
                ),
            ).toBe(false);
        });

        it('should build ability with dashboard permissions for user with space access', () => {
            const contextWithUser = {
                ...baseContext,
                userUuid: 'user-456',
            };

            const builder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(
                {
                    ...contextWithUser,
                    scopes: ['view:Dashboard'],
                },
                builder,
            );
            const ability = builder.build();

            // Can view dashboards with user access
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: 'org-123',
                        projectUuid: 'project-123',
                        access: [{ userUuid: 'user-456' }],
                    }),
                ),
            ).toBe(true);
        });

        it('should build ability with project-scoped permissions', () => {
            const projectContext = {
                ...baseContext,
                projectUuid: 'project-789',
            };

            const builder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(
                {
                    ...projectContext,
                    scopes: ['view:Project'],
                },
                builder,
            );
            const ability = builder.build();

            expect(
                ability.can(
                    'view',
                    subject('Project', {
                        organizationUuid: 'org-123',
                        projectUuid: 'project-789',
                    }),
                ),
            ).toBe(true);
        });

        it('should build ability with project creation permissions and type restrictions', () => {
            const builder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(
                {
                    ...baseContextWithOrg,
                    scopes: ['create:Project'],
                },
                builder,
            );
            const ability = builder.build();

            // Can create preview projects
            expect(
                ability.can(
                    'create',
                    subject('Project', {
                        organizationUuid: 'org-123',
                        type: ProjectType.PREVIEW,
                    }),
                ),
            ).toBe(true);

            // Cannot create default projects with basic scope
            expect(
                ability.can(
                    'create',
                    subject('Project', {
                        organizationUuid: 'org-123',
                        type: ProjectType.DEFAULT,
                    }),
                ),
            ).toBe(false);
        });

        it('should build ability with editor permissions for dashboards', () => {
            const editorContext = {
                ...baseContextWithOrg,
                userUuid: 'user-456',
            };

            const builder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(
                {
                    ...editorContext,
                    scopes: ['manage:Dashboard'],
                },
                builder,
            );
            const ability = builder.build();

            // Can manage dashboards where user is editor
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: 'org-123',
                        access: [
                            {
                                userUuid: 'user-456',
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toBe(true);
        });

        it('should build ability with admin permissions for spaces', () => {
            const adminContext = {
                ...baseContextWithOrg,
                userUuid: 'user-456',
            };

            const builder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(
                {
                    ...adminContext,
                    scopes: ['manage:Space'],
                },
                builder,
            );
            const ability = builder.build();

            // Can manage spaces where user is admin
            expect(
                ability.can(
                    'manage',
                    subject('Space', {
                        organizationUuid: 'org-123',
                        access: [
                            {
                                userUuid: 'user-456',
                                role: SpaceMemberRole.ADMIN,
                            },
                        ],
                    }),
                ),
            ).toBe(true);
        });

        it('should build ability with user-specific job status permissions', () => {
            const userContext = {
                ...baseContext,
                userUuid: 'user-456',
            };

            const builder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(
                {
                    ...userContext,
                    scopes: ['view:JobStatus@self'],
                },
                builder,
            );
            const ability = builder.build();

            // Can view job status created by the user
            expect(
                ability.can(
                    'view',
                    subject('JobStatus', {
                        createdByUserUuid: 'user-456',
                    }),
                ),
            ).toBe(true);

            // Cannot view job status created by another user
            expect(
                ability.can(
                    'view',
                    subject('JobStatus', {
                        createdByUserUuid: 'other-user',
                    }),
                ),
            ).toBe(false);
        });

        it('should build ability with AI agent thread permissions for enterprise users', () => {
            const userContext = {
                ...baseContext,
                userUuid: 'user-456',
                isEnterprise: true,
            };

            const builder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(
                {
                    ...userContext,
                    scopes: ['manage:AiAgentThread@self'],
                },
                builder,
            );
            const ability = builder.build();

            // Can manage user's own AI agent threads
            expect(
                ability.can(
                    'manage',
                    subject('AiAgentThread', {
                        projectUuid: 'project-123',
                        userUuid: 'user-456',
                    }),
                ),
            ).toBe(true);

            // Cannot manage another user's threads
            expect(
                ability.can(
                    'manage',
                    subject('AiAgentThread', {
                        projectUuid: 'project-123',
                        userUuid: 'other-user',
                    }),
                ),
            ).toBe(false);
        });

        it('should build ability with basic permissions for scopes without custom logic', () => {
            // These scopes don't have custom applyConditions
            const builder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(
                {
                    ...baseContext,
                    scopes: ['view:Analytics', 'manage:Tags'],
                },
                builder,
            );
            const ability = builder.build();

            expect(
                ability.can(
                    'view',
                    subject('Analytics', {
                        organizationUuid: 'org-123',
                        projectUuid: 'project-123',
                    }),
                ),
            ).toBe(true);

            expect(
                ability.can(
                    'manage',
                    subject('Tags', {
                        organizationUuid: 'org-123',
                        projectUuid: 'project-123',
                    }),
                ),
            ).toBe(true);
        });

        it('should handle unknown scopes gracefully', () => {
            const builder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(baseContext, builder);
            const ability = builder.build();

            // Unknown scope should not add any abilities
            expect(ability.rules.length).toBe(0);
        });

        it('should handle enterprise scopes when not enterprise', () => {
            const nonEnterpriseContext = {
                ...baseContext,
                isEnterprise: false,
            };

            const builder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(nonEnterpriseContext, builder);
            const ability = builder.build();

            // Enterprise scope should not add abilities in non-enterprise context
            expect(ability.rules.length).toBe(0);
        });

        it('should build a complete ability from multiple scopes', () => {
            const context = {
                userUuid: 'user-456',
                organizationUuid: 'org-123',
                isEnterprise: false,
                organizationRole: 'admin',
                scopes: ['view:Dashboard', 'manage:SavedChart', 'view:Project'],
            };

            const builder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(context, builder);
            const ability = builder.build();

            // Check that all abilities were applied
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: 'org-123',
                        projectUuid: 'project-789',
                        isPrivate: false,
                    }),
                ),
            ).toBe(true);

            // Should be able to manage saved charts with proper access
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid: 'org-123',
                        access: [
                            {
                                userUuid: 'user-456',
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toBe(true);

            expect(
                ability.can(
                    'view',
                    subject('Project', {
                        organizationUuid: 'org-123',
                        projectUuid: 'project-789',
                    }),
                ),
            ).toBe(true);
        });

        describe('scope dependency checks', () => {
            it('should apply organization-level permissions when manage:organization scope is present', () => {
                const contextWithOrgManage = {
                    ...baseContext,
                    userUuid: 'user-456',
                    scopes: ['manage:Organization', 'manage:SavedChart'],
                };

                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(contextWithOrgManage, builder);
                const ability = builder.build();

                // Should have organization-wide permissions for saved charts
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);

                // Should not require user access restrictions
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                            access: [{ userUuid: 'other-user' }],
                        }),
                    ),
                ).toBe(true);
            });

            it('should apply user-restricted permissions when manage:organization scope is not present', () => {
                const contextWithoutOrgManage = {
                    ...baseContext,
                    userUuid: 'user-456',
                    scopes: ['manage:SavedChart@space'],
                };

                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(contextWithoutOrgManage, builder);
                const ability = builder.build();

                // Should require user access restrictions
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.EDITOR,
                                },
                            ],
                        }),
                    ),
                ).toBe(true);

                // Should not allow access to other users' charts
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                            access: [{ userUuid: 'other-user' }],
                        }),
                    ),
                ).toBe(false);
            });

            it('should handle space management with different scope combinations', () => {
                const contextWithProjectManage = {
                    ...baseContext,
                    userUuid: 'user-456',
                    scopes: ['manage:Project', 'manage:Space'],
                };

                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(contextWithProjectManage, builder);
                const ability = builder.build();

                // Should allow managing public spaces when user has project management
                expect(
                    ability.can(
                        'manage',
                        subject('Space', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                            isPrivate: false,
                        }),
                    ),
                ).toBe(true);

                // Should still allow managing spaces where user is admin
                expect(
                    ability.can(
                        'manage',
                        subject('Space', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.ADMIN,
                                },
                            ],
                        }),
                    ),
                ).toBe(true);
            });

            it('should handle promotion permissions based on organization scope', () => {
                const contextWithOrgManage = {
                    ...baseContext,
                    userUuid: 'user-456',
                    scopes: ['manage:Organization', 'promote:Dashboard'],
                };

                const contextWithoutOrgManage = {
                    ...baseContext,
                    userUuid: 'user-456',
                    scopes: ['promote:Dashboard@space'],
                };

                // Test dashboard promotion with organization management
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(contextWithOrgManage, builder);
                const abilityWithOrg = builder.build();

                expect(
                    abilityWithOrg.can(
                        'promote',
                        subject('Dashboard', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);

                // Test dashboard promotion without organization management
                const builderWithoutOrg = new AbilityBuilder<MemberAbility>(
                    Ability,
                );
                buildAbilityFromScopes(
                    contextWithoutOrgManage,
                    builderWithoutOrg,
                );
                const abilityWithoutOrg = builderWithoutOrg.build();

                expect(
                    abilityWithoutOrg.can(
                        'promote',
                        subject('Dashboard', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.EDITOR,
                                },
                            ],
                        }),
                    ),
                ).toBe(true);

                // Should not allow promotion without proper access
                expect(
                    abilityWithoutOrg.can(
                        'promote',
                        subject('Dashboard', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                            access: [{ userUuid: 'other-user' }],
                        }),
                    ),
                ).toBe(false);
            });
        });

        describe('AI agent thread permissions with modifiers', () => {
            it('should handle view:ai_agent_thread@self permissions', () => {
                const contextWithUser = {
                    ...baseContext,
                    userUuid: 'user-456',
                    isEnterprise: true,
                };

                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...contextWithUser,
                        scopes: ['view:AiAgentThread@self'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can view own AI agent threads
                expect(
                    ability.can(
                        'view',
                        subject('AiAgentThread', {
                            projectUuid: 'project-123',
                            userUuid: 'user-456',
                        }),
                    ),
                ).toBe(true);

                // Cannot view other users' threads
                expect(
                    ability.can(
                        'view',
                        subject('AiAgentThread', {
                            projectUuid: 'project-123',
                            userUuid: 'other-user',
                        }),
                    ),
                ).toBe(false);
            });

            it('should handle manage:ai_agent_thread@self permissions', () => {
                const contextWithUser = {
                    ...baseContext,
                    userUuid: 'user-456',
                    isEnterprise: true,
                };

                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...contextWithUser,
                        userUuid: 'user-456',
                        scopes: ['manage:AiAgentThread@self'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can manage own AI agent threads
                expect(
                    ability.can(
                        'manage',
                        subject('AiAgentThread', {
                            projectUuid: 'project-123',
                            userUuid: 'user-456',
                        }),
                    ),
                ).toBe(true);

                // Cannot manage other users' threads
                expect(
                    ability.can(
                        'manage',
                        subject('AiAgentThread', {
                            userUuid: 'other-user',
                        }),
                    ),
                ).toBe(false);
            });

            it('should handle view:ai_agent_thread permissions for all threads', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContextWithOrg,
                        isEnterprise: true,
                        scopes: ['view:AiAgentThread'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can view any AI agent thread
                expect(
                    ability.can(
                        'view',
                        subject('AiAgentThread', {
                            organizationUuid: 'org-123',
                            userUuid: 'any-user',
                        }),
                    ),
                ).toBe(true);
            });

            it('should handle manage:ai_agent_thread permissions for all threads', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContextWithOrg,
                        isEnterprise: true,
                        scopes: ['manage:AiAgentThread'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can manage any AI agent thread
                expect(
                    ability.can(
                        'manage',
                        subject('AiAgentThread', {
                            organizationUuid: 'org-123',
                            userUuid: 'any-user',
                        }),
                    ),
                ).toBe(true);
            });
        });

        describe('edge cases and error handling', () => {
            it('should handle empty scope array', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(baseContext, builder);
                const ability = builder.build();
                expect(ability.rules.length).toBe(0);
            });

            it('should handle undefined userUuid in context', () => {
                const contextWithoutUser = {
                    ...baseContext,
                };

                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...contextWithoutUser,
                        scopes: ['view:Dashboard'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Should only allow viewing public dashboards
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                            isPrivate: false,
                        }),
                    ),
                ).toBe(true);

                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                            isPrivate: true,
                        }),
                    ),
                ).toBe(false);
            });

            it('should handle mixed valid and invalid scopes', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        scopes: [
                            'view:Dashboard',
                            'view:Project',
                            'invalid:scope',
                        ],
                    },
                    builder,
                );
                const ability = builder.build();

                // We have 3 valid rules, 2 for dashboard and 1 for project, dropping the invalid scope
                expect(ability.rules.length).toBe(3);
                expect(
                    ability.rules.filter((r) => r.subject === 'Dashboard'),
                ).toHaveLength(2);
                expect(
                    ability.rules.find((r) => r.subject === 'Project'),
                ).toBeDefined();
            });
        });

        describe('cross-boundary access tests', () => {
            it('should not allow access to resources from different organizations', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        scopes: [
                            'view:Dashboard',
                            'manage:SavedChart',
                            'view:Space',
                        ],
                    },
                    builder,
                );
                const ability = builder.build();

                // Should not access dashboard from different org
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            organizationUuid: 'different-org',
                            isPrivate: false,
                        }),
                    ),
                ).toBe(false);

                // Should not manage saved chart from different org
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            organizationUuid: 'different-org',
                        }),
                    ),
                ).toBe(false);

                // Should not view space from different org
                expect(
                    ability.can(
                        'view',
                        subject('Space', {
                            organizationUuid: 'different-org',
                            isPrivate: false,
                        }),
                    ),
                ).toBe(false);
            });

            it('should not allow access to resources from different projects', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        scopes: ['view:SavedChart'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Should not access saved chart from different project
                expect(
                    ability.can(
                        'view',
                        subject('SavedChart', {
                            organizationUuid: 'org-123',
                            projectUuid: 'different-project',
                            isPrivate: false,
                        }),
                    ),
                ).toBe(false);
            });
        });

        describe('private resource access with space roles', () => {
            it('should handle viewer role access to private resources', () => {
                const contextWithUser = {
                    ...baseContextWithOrg,
                    userUuid: 'user-456',
                };

                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...contextWithUser,
                        scopes: ['view:Dashboard'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can view private dashboard with viewer access
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            organizationUuid: 'org-123',
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.VIEWER,
                                },
                            ],
                        }),
                    ),
                ).toBe(true);

                // Cannot view private dashboard without access
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            organizationUuid: 'org-123',
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toBe(false);

                // Cannot view private dashboard with access for another user
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            organizationUuid: 'org-123',
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: 'other-user',
                                    role: SpaceMemberRole.VIEWER,
                                },
                            ],
                        }),
                    ),
                ).toBe(false);
            });

            it('should handle editor role for managing resources', () => {
                const contextWithUser = {
                    ...baseContextWithOrg,
                    userUuid: 'user-456',
                };

                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...contextWithUser,
                        scopes: ['manage:Dashboard@space'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can manage dashboard with editor role
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            organizationUuid: 'org-123',
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.EDITOR,
                                },
                            ],
                        }),
                    ),
                ).toBe(true);

                // Can manage dashboard with admin role
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            organizationUuid: 'org-123',
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.ADMIN,
                                },
                            ],
                        }),
                    ),
                ).toBe(true);

                // Cannot manage dashboard with viewer role
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            organizationUuid: 'org-123',
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.VIEWER,
                                },
                            ],
                        }),
                    ),
                ).toBe(false);

                // Cannot manage dashboard without access
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            organizationUuid: 'org-123',
                            access: [],
                        }),
                    ),
                ).toBe(false);
            });

            it('should handle space admin role for managing spaces', () => {
                const contextWithUser = {
                    ...baseContext,
                    userUuid: 'user-456',
                };

                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...contextWithUser,
                        scopes: ['manage:Space@assigned'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can manage space with admin role
                expect(
                    ability.can(
                        'manage',
                        subject('Space', {
                            projectUuid: baseContext.projectUuid,
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.ADMIN,
                                },
                            ],
                        }),
                    ),
                ).toBe(true);

                // Cannot manage space with editor role
                expect(
                    ability.can(
                        'manage',
                        subject('Space', {
                            organizationUuid: 'org-123',
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.EDITOR,
                                },
                            ],
                        }),
                    ),
                ).toBe(false);

                // Cannot manage space with viewer role
                expect(
                    ability.can(
                        'manage',
                        subject('Space', {
                            organizationUuid: 'org-123',
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.VIEWER,
                                },
                            ],
                        }),
                    ),
                ).toBe(false);
            });
        });

        describe('job and job status permissions', () => {
            it('should handle view:job@self permissions', () => {
                const contextWithUser = {
                    ...baseContext,
                    userUuid: 'user-456',
                };

                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...contextWithUser,
                        scopes: ['view:Job@self'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can view own jobs
                expect(
                    ability.can(
                        'view',
                        subject('Job', {
                            userUuid: 'user-456',
                        }),
                    ),
                ).toBe(true);

                // Cannot view other users' jobs without manage permission
                expect(
                    ability.can(
                        'view',
                        subject('Job', {
                            userUuid: 'other-user',
                        }),
                    ),
                ).toBe(false);
            });

            it('should handle view:job_status@self permissions for user context', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        userUuid: 'user-456',
                        scopes: ['view:JobStatus@self'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can view own job status
                expect(
                    ability.can(
                        'view',
                        subject('JobStatus', {
                            createdByUserUuid: 'user-456',
                        }),
                    ),
                ).toBe(true);

                // Cannot view other users' job status
                expect(
                    ability.can(
                        'view',
                        subject('JobStatus', {
                            createdByUserUuid: 'other-user',
                        }),
                    ),
                ).toBe(false);
            });

            it('should handle view:job_status permissions for all job status', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContextWithOrg,
                        scopes: ['view:JobStatus'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can view all job status in organization
                expect(
                    ability.can(
                        'view',
                        subject('JobStatus', {
                            organizationUuid: 'org-123',
                        }),
                    ),
                ).toBe(true);

                // Cannot view job status from another organization
                expect(
                    ability.can(
                        'view',
                        subject('JobStatus', {
                            organizationUuid: 'different-org',
                        }),
                    ),
                ).toBe(false);
            });

            it('should handle view:job permissions for all jobs', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        scopes: ['view:Job'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can view any job
                expect(
                    ability.can(
                        'view',
                        subject('Job', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                            userUuid: 'any-user',
                        }),
                    ),
                ).toBe(true);
            });
        });

        describe('space-based permissions modifiers', () => {
            it('should handle manage:dashboard@space permissions', () => {
                const contextWithUser = {
                    ...baseContextWithOrg,
                    userUuid: 'user-456',
                };

                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...contextWithUser,
                        scopes: ['manage:Dashboard@space'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can manage dashboard with editor role
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            organizationUuid: 'org-123',
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.EDITOR,
                                },
                            ],
                        }),
                    ),
                ).toBe(true);

                // Can manage dashboard with admin role
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            organizationUuid: 'org-123',
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.ADMIN,
                                },
                            ],
                        }),
                    ),
                ).toBe(true);

                // Cannot manage dashboard with viewer role
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            organizationUuid: 'org-123',
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.VIEWER,
                                },
                            ],
                        }),
                    ),
                ).toBe(false);

                // Cannot manage dashboard without access
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            organizationUuid: 'org-123',
                            access: [],
                        }),
                    ),
                ).toBe(false);
            });

            it('should handle manage:saved_chart@space permissions', () => {
                const contextWithUser = {
                    ...baseContext,
                    userUuid: 'user-456',
                };

                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...contextWithUser,
                        scopes: ['manage:SavedChart@space'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can manage saved chart with editor role
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            projectUuid: 'project-123',
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.EDITOR,
                                },
                            ],
                        }),
                    ),
                ).toBe(true);

                // Can manage saved chart with admin role
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            projectUuid: 'project-123',
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.ADMIN,
                                },
                            ],
                        }),
                    ),
                ).toBe(true);

                // Cannot manage without proper access
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            projectUuid: 'project-123',
                            access: [
                                {
                                    userUuid: 'other-user',
                                    role: SpaceMemberRole.EDITOR,
                                },
                            ],
                        }),
                    ),
                ).toBe(false);
            });

            it('should handle promote:dashboard@space permissions', () => {
                const contextWithUser = {
                    ...baseContext,
                    userUuid: 'user-456',
                };

                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...contextWithUser,
                        scopes: ['promote:Dashboard@space'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can promote dashboard with editor access
                expect(
                    ability.can(
                        'promote',
                        subject('Dashboard', {
                            projectUuid: 'project-123',
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.EDITOR,
                                },
                            ],
                        }),
                    ),
                ).toBe(true);

                // Cannot promote without editor access
                expect(
                    ability.can(
                        'promote',
                        subject('Dashboard', {
                            projectUuid: 'project-123',
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.VIEWER,
                                },
                            ],
                        }),
                    ),
                ).toBe(false);
            });

            it('should handle manage:semantic_viewer@space permissions', () => {
                const contextWithUser = {
                    ...baseContextWithOrg,
                    userUuid: 'user-456',
                };

                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...contextWithUser,
                        scopes: ['manage:SemanticViewer@space'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can manage semantic viewer with editor role
                expect(
                    ability.can(
                        'manage',
                        subject('SemanticViewer', {
                            organizationUuid: 'org-123',
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.EDITOR,
                                },
                            ],
                        }),
                    ),
                ).toBe(true);

                // Cannot manage without editor role
                expect(
                    ability.can(
                        'manage',
                        subject('SemanticViewer', {
                            organizationUuid: 'org-123',
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.VIEWER,
                                },
                            ],
                        }),
                    ),
                ).toBe(false);
            });
        });

        describe('semantic viewer permissions', () => {
            it('should handle view:semantic_viewer permissions', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        scopes: ['view:SemanticViewer'],
                    },
                    builder,
                );
                const ability = builder.build();

                expect(
                    ability.can(
                        'view',
                        subject('SemanticViewer', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);
            });

            it('should handle manage:semantic_viewer with organization scope', () => {
                const contextWithOrgManage = {
                    ...baseContextWithOrg,
                    userUuid: 'user-456',
                    scopes: ['manage:Organization'],
                };

                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...contextWithOrgManage,
                        scopes: [
                            'manage:Organization',
                            'manage:SemanticViewer',
                        ],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can manage semantic viewer organization-wide
                expect(
                    ability.can(
                        'manage',
                        subject('SemanticViewer', {
                            organizationUuid: 'org-123',
                        }),
                    ),
                ).toBe(true);
            });

            it('should handle manage:semantic_viewer with editor role', () => {
                const contextWithUser = {
                    ...baseContextWithOrg,
                    userUuid: 'user-456',
                };

                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...contextWithUser,
                        scopes: ['manage:SemanticViewer@space'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can manage semantic viewer with editor role
                expect(
                    ability.can(
                        'manage',
                        subject('SemanticViewer', {
                            organizationUuid: 'org-123',
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.EDITOR,
                                },
                            ],
                        }),
                    ),
                ).toBe(true);

                // Cannot manage without proper access
                expect(
                    ability.can(
                        'manage',
                        subject('SemanticViewer', {
                            organizationUuid: 'org-123',
                            access: [
                                {
                                    userUuid: 'user-456',
                                    role: SpaceMemberRole.VIEWER,
                                },
                            ],
                        }),
                    ),
                ).toBe(false);
            });
        });

        describe('create space permissions', () => {
            it('should handle create:space permissions', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        scopes: ['create:Space'],
                    },
                    builder,
                );
                const ability = builder.build();

                expect(
                    ability.can(
                        'create',
                        subject('Space', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);
            });
        });

        describe('export permissions', () => {
            it('should handle export csv permissions', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        scopes: ['manage:ExportCsv'],
                    },
                    builder,
                );
                const ability = builder.build();

                expect(
                    ability.can(
                        'manage',
                        subject('ExportCsv', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);
            });

            it('should handle change csv results permissions', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        scopes: ['manage:ChangeCsvResults'],
                    },
                    builder,
                );
                const ability = builder.build();

                expect(
                    ability.can(
                        'manage',
                        subject('ChangeCsvResults', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);
            });
        });

        describe('underlying data permissions', () => {
            it('should handle view:underlying_data permissions', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        scopes: ['view:UnderlyingData'],
                    },
                    builder,
                );
                const ability = builder.build();

                expect(
                    ability.can(
                        'view',
                        subject('UnderlyingData', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);
            });
        });

        describe('sql runner and custom sql permissions', () => {
            it('should handle manage:sql_runner permissions', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        scopes: ['manage:SqlRunner'],
                    },
                    builder,
                );
                const ability = builder.build();

                expect(
                    ability.can(
                        'manage',
                        subject('SqlRunner', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);
            });

            it('should handle manage:custom_sql permissions', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        scopes: ['manage:CustomSql'],
                    },
                    builder,
                );
                const ability = builder.build();

                expect(
                    ability.can(
                        'manage',
                        subject('CustomSql', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);
            });
        });

        describe('project delete permissions', () => {
            it('should handle delete:project@self permissions', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        userUuid: 'user-456',
                        scopes: ['delete:Project@self'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can delete specific project
                expect(
                    ability.can(
                        'delete',
                        subject('Project', {
                            createdByUserUuid: 'user-456',
                            type: ProjectType.PREVIEW,
                        }),
                    ),
                ).toBe(true);

                expect(
                    ability.can(
                        'delete',
                        subject('Project', {
                            createdByUserUuid: 'different-user',
                            type: ProjectType.PREVIEW,
                        }),
                    ),
                ).toBe(false);
            });

            it('should handle delete:project@self for own preview projects', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        userUuid: 'user-456',
                        scopes: ['delete:Project@self'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Can delete preview projects in a project
                expect(
                    ability.can(
                        'delete',
                        subject('Project', {
                            createdByUserUuid: 'user-456',
                            type: ProjectType.PREVIEW,
                        }),
                    ),
                ).toBe(true);

                // Cannot delete default projects
                expect(
                    ability.can(
                        'delete',
                        subject('Project', {
                            createdByUserUuid: 'user-456',
                            type: ProjectType.DEFAULT,
                        }),
                    ),
                ).toBe(false);
            });
        });

        describe('pinned items permissions', () => {
            it('should handle view:pinned_items permissions', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        scopes: ['view:PinnedItems'],
                    },
                    builder,
                );
                const ability = builder.build();

                expect(
                    ability.can(
                        'view',
                        subject('PinnedItems', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);
            });

            it('should handle manage:pinned_items permissions', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        scopes: ['manage:PinnedItems'],
                    },
                    builder,
                );
                const ability = builder.build();

                expect(
                    ability.can(
                        'manage',
                        subject('PinnedItems', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);
            });
        });

        describe('explore permissions', () => {
            it('should handle manage:explore permissions', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        scopes: ['manage:Explore'],
                    },
                    builder,
                );
                const ability = builder.build();

                expect(
                    ability.can(
                        'manage',
                        subject('Explore', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);
            });
        });

        describe('virtual view permissions', () => {
            it('should handle create:virtual_view permissions', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        scopes: ['create:VirtualView'],
                    },
                    builder,
                );
                const ability = builder.build();

                expect(
                    ability.can(
                        'create',
                        subject('VirtualView', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);

                // Should not be able to delete with create scope
                expect(
                    ability.can(
                        'delete',
                        subject('VirtualView', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(false);
            });

            it('should handle delete:virtual_view permissions', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        scopes: ['delete:VirtualView'],
                    },
                    builder,
                );
                const ability = builder.build();

                expect(
                    ability.can(
                        'delete',
                        subject('VirtualView', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);

                // Should not be able to create with delete scope
                expect(
                    ability.can(
                        'create',
                        subject('VirtualView', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(false);
            });

            it('should handle manage:virtual_view permissions for both create and delete', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        scopes: ['manage:VirtualView'],
                    },
                    builder,
                );
                const ability = builder.build();

                // Should be able to manage (create and delete)
                expect(
                    ability.can(
                        'manage',
                        subject('VirtualView', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);

                // Manage scope should allow both create and delete actions
                expect(
                    ability.can(
                        'create',
                        subject('VirtualView', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);

                expect(
                    ability.can(
                        'delete',
                        subject('VirtualView', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);
            });

            it('should not allow virtual view actions for different organizations', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContextWithOrg,
                        scopes: [
                            'create:VirtualView',
                            'delete:VirtualView',
                            'manage:VirtualView',
                        ],
                    },
                    builder,
                );
                const ability = builder.build();

                // Should not access virtual views from different org
                expect(
                    ability.can(
                        'create',
                        subject('VirtualView', {
                            organizationUuid: 'different-org',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(false);

                expect(
                    ability.can(
                        'delete',
                        subject('VirtualView', {
                            organizationUuid: 'different-org',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(false);

                expect(
                    ability.can(
                        'manage',
                        subject('VirtualView', {
                            organizationUuid: 'different-org',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(false);
            });

            it('should allow virtual view actions for different projects within same organization', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContextWithOrg,
                        scopes: [
                            'create:VirtualView',
                            'delete:VirtualView',
                            'manage:VirtualView',
                        ],
                    },
                    builder,
                );
                const ability = builder.build();

                // Virtual view permissions are organization-scoped, not project-scoped
                // So they should work across different projects within the same org
                expect(
                    ability.can(
                        'create',
                        subject('VirtualView', {
                            organizationUuid: 'org-123',
                            projectUuid: 'different-project',
                        }),
                    ),
                ).toBe(true);

                expect(
                    ability.can(
                        'delete',
                        subject('VirtualView', {
                            organizationUuid: 'org-123',
                            projectUuid: 'different-project',
                        }),
                    ),
                ).toBe(true);

                expect(
                    ability.can(
                        'manage',
                        subject('VirtualView', {
                            organizationUuid: 'org-123',
                            projectUuid: 'different-project',
                        }),
                    ),
                ).toBe(true);
            });
        });

        describe('organization member profile permissions', () => {
            it('should handle view:organization_member_profile permissions', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContextWithOrg,
                        scopes: ['view:OrganizationMemberProfile'],
                    },
                    builder,
                );
                const ability = builder.build();

                expect(
                    ability.can(
                        'view',
                        subject('OrganizationMemberProfile', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);

                // Cannot view profiles from different project
                expect(
                    ability.can(
                        'view',
                        subject('OrganizationMemberProfile', {
                            organizationUuid: 'different-org',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(false);
            });

            it('should handle manage:organization_member_profile permissions', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        scopes: ['manage:OrganizationMemberProfile'],
                    },
                    builder,
                );
                const ability = builder.build();

                expect(
                    ability.can(
                        'manage',
                        subject('OrganizationMemberProfile', {
                            organizationUuid: 'org-123',
                            projectUuid: 'project-123',
                        }),
                    ),
                ).toBe(true);
            });
        });

        describe('personal access token permissions', () => {
            it('should allow managing PAT when enabled and user has allowed role', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        isEnterprise: true,
                        organizationRole: 'admin',
                        scopes: ['manage:PersonalAccessToken'],
                        permissionsConfig: {
                            pat: {
                                enabled: true,
                                allowedOrgRoles: ['admin', 'developer'],
                            },
                        },
                    },
                    builder,
                );
                const ability = builder.build();

                expect(ability.can('manage', 'PersonalAccessToken')).toBe(true);
            });

            it('should not allow managing PAT when disabled', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        isEnterprise: true,
                        organizationRole: 'admin',
                        scopes: ['manage:PersonalAccessToken'],
                        permissionsConfig: {
                            pat: {
                                enabled: false,
                                allowedOrgRoles: ['admin', 'developer'],
                            },
                        },
                    },
                    builder,
                );
                const ability = builder.build();

                expect(
                    ability.can('manage', subject('PersonalAccessToken', {})),
                ).toBe(false);
            });

            it('should not allow managing PAT when user role not in allowed roles', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        isEnterprise: true,
                        organizationRole: 'developer',
                        scopes: ['manage:PersonalAccessToken'],
                        permissionsConfig: {
                            pat: {
                                enabled: true,
                                allowedOrgRoles: ['admin'],
                            },
                        },
                    },
                    builder,
                );
                const ability = builder.build();

                expect(
                    ability.can('manage', subject('PersonalAccessToken', {})),
                ).toBe(false);
            });

            it('should not allow managing PAT when no permissions config provided', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        isEnterprise: true,
                        organizationRole: 'admin',
                        scopes: ['manage:PersonalAccessToken'],
                        // No permissionsConfig provided
                    },
                    builder,
                );
                const ability = builder.build();

                expect(
                    ability.can('manage', subject('PersonalAccessToken', {})),
                ).toBe(false);
            });

            it('should not allow managing PAT when no organization role provided', () => {
                const builder = new AbilityBuilder<MemberAbility>(Ability);
                buildAbilityFromScopes(
                    {
                        ...baseContext,
                        isEnterprise: true,
                        organizationRole: '', // Empty organization role
                        scopes: ['manage:PersonalAccessToken'],
                        permissionsConfig: {
                            pat: {
                                enabled: true,
                                allowedOrgRoles: ['admin', 'developer'],
                            },
                        },
                    },
                    builder,
                );
                const ability = builder.build();

                expect(
                    ability.can('manage', subject('PersonalAccessToken', {})),
                ).toBe(false);
            });
        });
    });
});
