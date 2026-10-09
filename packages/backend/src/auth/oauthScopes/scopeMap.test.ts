import { Ability, AbilityBuilder } from '@casl/ability';
import {
    buildAbilityFromScopes,
    getScopes,
    getUserAbilityBuilder,
    MemberAbility,
    OrganizationMemberRole,
    ProjectMemberRole,
    ProjectType,
} from '@lightdash/common';
import {
    classifyOAuthOperation,
    OAUTH_ACTIONS,
    oauthScopeAllows,
} from './scopeMap';

describe('OAuth scope operation map', () => {
    it.each([
        [['read'], 'view', 'Project', true],
        [['read'], 'create', 'SavedChart', false],
        [['write'], 'view', 'Project', true],
        [['write'], 'create', 'SavedChart', true],
        [['mcp:read'], 'view', 'OrganizationMemberProfile', true],
        [['mcp:read'], 'manage', 'Organization', false],
        [['mcp:write'], 'create', 'SavedChart', true],
        [['mcp:write'], 'view', 'Project', true],
        [['read', 'mcp:read'], 'create', 'SavedChart', false],
        [['read', 'mcp:write'], 'create', 'SavedChart', true],
        [['mcp:read', 'write'], 'manage', 'Organization', true],
        [[], 'view', 'Project', false],
        [['unknown'], 'view', 'Project', false],
        [['write'], 'futureAction', 'Project', false],
        [['write'], 'view', 'FutureSubject', false],
        [['write'], 'view', 'toString', false],
        [['read'], 'export', 'Dashboard', true],
        [['read'], 'manage', 'SqlRunner', true],
        [['read'], 'manage', 'Explore', true],
        [['read'], 'manage', 'ExportCsv', true],
        [['read'], 'manage', 'PreAggregation', true],
        [['read'], 'manage', 'CustomSqlTableCalculations', true],
        [['read'], 'create', 'Job', true],
        [['read'], 'manage', 'CustomFields', false],
        [['read'], 'manage', 'CustomSql', false],
        [['read'], 'manage', 'GoogleSheets', false],
    ] as const)('%j %s:%s = %s', (scopes, action, subjectType, allowed) => {
        expect(oauthScopeAllows([...scopes], action, subjectType)).toBe(
            allowed,
        );
    });

    it('classifies every rule emitted by system and custom role builders', () => {
        const rules: MemberAbility['rules'] = [];
        Object.values(OrganizationMemberRole).forEach((role) => {
            Object.values(ProjectMemberRole).forEach((projectRole) => {
                const { builder } = getUserAbilityBuilder({
                    user: {
                        role,
                        roleUuid: undefined,
                        userUuid: 'user',
                        organizationUuid: 'org',
                    },
                    projectProfiles: [
                        {
                            role: projectRole,
                            roleUuid: undefined,
                            userUuid: 'user',
                            projectUuid: 'project',
                        },
                    ],
                    permissionsConfig: {
                        pat: {
                            enabled: true,
                            allowedOrgRoles: Object.values(
                                OrganizationMemberRole,
                            ),
                        },
                    },
                });
                rules.push(...builder.rules);
            });
        });
        [false, true].forEach((isEnterprise) => {
            const scopes = getScopes({ isEnterprise }).map(({ name }) => name);
            const builder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(
                {
                    organizationUuid: 'org',
                    userUuid: 'user',
                    scopes,
                    isEnterprise,
                },
                builder,
            );
            Object.values(ProjectType).forEach((projectType) => {
                ['user', 'another-user', null].forEach(
                    (projectCreatedByUserUuid) => {
                        buildAbilityFromScopes(
                            {
                                projectUuid: 'project',
                                projectType,
                                projectCreatedByUserUuid,
                                userUuid: 'user',
                                scopes,
                                isEnterprise,
                            },
                            builder,
                        );
                    },
                );
            });
            rules.push(...builder.rules);
        });
        expect(rules.length).toBeGreaterThan(100);
        const unclassified = new Set<string>();
        rules.forEach((rule) => {
            const ruleActions = Array.isArray(rule.action)
                ? rule.action
                : [rule.action];
            const actions = ruleActions.includes('manage')
                ? OAUTH_ACTIONS
                : ruleActions;
            const subjects = Array.isArray(rule.subject)
                ? rule.subject
                : [rule.subject];
            actions.forEach((action) =>
                subjects.forEach((subjectType) => {
                    if (
                        classifyOAuthOperation(
                            action,
                            subjectType as string,
                        ) === null
                    ) {
                        unclassified.add(`${action}:${subjectType}`);
                    }
                }),
            );
        });
        expect([...unclassified].sort()).toEqual([]);
    });
});
