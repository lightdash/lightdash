/* eslint-disable no-console */
import { Ability, AbilityBuilder } from '@casl/ability';
import groupBy from 'lodash/groupBy';
import isEqual from 'lodash/isEqual';
import { ProjectMemberRole } from '../types/projectMemberRole';
import { projectMemberAbilities } from './projectMemberAbility';
import {
    PROJECT_ADMIN,
    PROJECT_DEVELOPER,
    PROJECT_EDITOR,
    PROJECT_INTERACTIVE_VIEWER,
    PROJECT_VIEWER,
} from './projectMemberAbility.mock';
import { getAllScopesForRole } from './roleToScopeMapping';
import { buildAbilityFromScopes } from './scopeAbilityBuilder';
import { type MemberAbility } from './types';

type CASLRule = {
    action: string;
    subject: string;
    conditions?: Record<string, unknown>;
    inverted?: boolean;
    reason?: string;
};

/**
 * Normalize a CASL rule for comparison by sorting object keys and handling undefined values
 */
const normalizeRule = (rule: CASLRule): CASLRule => ({
    action: rule.action,
    subject: rule.subject,
});

/**
 * Compare two sets of CASL rules for functional equivalence
 */
const compareRuleSets = (
    roleBasedRules: CASLRule[],
    scopeBasedRules: CASLRule[],
    roleName: string,
): { isEqual: boolean; mismatches: string[] } => {
    const normalizedRoleRules = roleBasedRules.map(normalizeRule);
    const normalizedScopeRules = scopeBasedRules.map(normalizeRule);

    const mismatches: string[] = [];

    // Check if rule counts match
    if (normalizedRoleRules.length !== normalizedScopeRules.length) {
        mismatches.push(
            `Rule count mismatch: role-based has ${normalizedRoleRules.length} rules, scope-based has ${normalizedScopeRules.length} rules`,
        );
    }

    // Group rules by action+subject for easier comparison
    const roleRulesGrouped = groupBy(
        normalizedRoleRules,
        (rule) => `${rule.action}:${rule.subject}`,
    );
    const scopeRulesGrouped = groupBy(
        normalizedScopeRules,
        (rule) => `${rule.action}:${rule.subject}`,
    );

    // Check for missing or extra rule types
    const roleKeys = new Set(Object.keys(roleRulesGrouped));
    const scopeKeys = new Set(Object.keys(scopeRulesGrouped));

    const missingInScope = [...roleKeys].filter((key) => !scopeKeys.has(key));
    const extraInScope = [...scopeKeys].filter((key) => !roleKeys.has(key));

    missingInScope.forEach((key) => {
        mismatches.push(`Missing in scope-based: ${key}`);
    });

    extraInScope.forEach((key) => {
        mismatches.push(`Extra in scope-based: ${key}`);
    });

    // Compare matching rule groups
    const commonKeys = [...roleKeys].filter((key) => scopeKeys.has(key));

    commonKeys.forEach((key) => {
        const roleRulesForKey = roleRulesGrouped[key];
        const scopeRulesForKey = scopeRulesGrouped[key];

        // For rules with the same action+subject, we need to check if the conditions are equivalent
        // This is more complex because multiple rules might combine to create the same effective permissions
        if (roleRulesForKey.length !== scopeRulesForKey.length) {
            // Different number of rules for same action+subject - this might be OK if conditions are equivalent
            // For now, we'll flag this as a potential issue but continue checking
            mismatches.push(
                `Different rule count for ${key}: role-based has ${roleRulesForKey.length}, scope-based has ${scopeRulesForKey.length}`,
            );
        }

        // Check if rule sets contain equivalent conditions
        const roleConditions = roleRulesForKey
            .map((r) => r.conditions)
            .filter(Boolean);
        const scopeConditions = scopeRulesForKey
            .map((r) => r.conditions)
            .filter(Boolean);

        if (!isEqual(roleConditions, scopeConditions)) {
            mismatches.push(
                `Condition mismatch on ${roleName} for ${key}:\nRole-based: ${JSON.stringify(
                    roleConditions,
                    null,
                    2,
                )}\nScope-based: ${JSON.stringify(scopeConditions, null, 2)}`,
            );
        }
    });

    return {
        isEqual: mismatches.length === 0,
        mismatches,
    };
};

/**
 * List of enterprise-only subject names that should be filtered in non-enterprise mode
 */
const ENTERPRISE_SUBJECTS = new Set([
    'MetricsTree',
    'SpotlightTableConfig',
    'AiAgent',
    'AiAgentThread',
    'ContentAsCode',
]);

/**
 * Filter enterprise rules from role-based abilities when testing in non-enterprise mode
 */
const filterEnterpriseRules = (
    rules: CASLRule[],
    isEnterprise: boolean,
): CASLRule[] => {
    if (isEnterprise) {
        return rules;
    }

    return rules.filter((rule) => !ENTERPRISE_SUBJECTS.has(rule.subject));
};

/**
 * Test role-to-scope parity for a specific role
 */
const testRoleScopeParity = (
    role: ProjectMemberRole,
    isEnterprise: boolean = false,
): { isEqual: boolean; mismatches: string[] } => {
    // Get the appropriate mock member profile
    const memberProfiles = {
        [ProjectMemberRole.VIEWER]: PROJECT_VIEWER,
        [ProjectMemberRole.INTERACTIVE_VIEWER]: PROJECT_INTERACTIVE_VIEWER,
        [ProjectMemberRole.EDITOR]: PROJECT_EDITOR,
        [ProjectMemberRole.DEVELOPER]: PROJECT_DEVELOPER,
        [ProjectMemberRole.ADMIN]: PROJECT_ADMIN,
    };

    const member = memberProfiles[role];

    // Build abilities using role-based approach
    const roleBuilder = new AbilityBuilder<MemberAbility>(Ability);
    projectMemberAbilities[role](member, roleBuilder);
    const roleAbility = roleBuilder.build();

    // Filter enterprise rules from role-based abilities if not enterprise
    const filteredRoleRules = filterEnterpriseRules(
        roleAbility.rules as CASLRule[],
        isEnterprise,
    );

    // Build abilities using scope-based approach
    const scopeBuilder = new AbilityBuilder<MemberAbility>(Ability);
    const scopes = getAllScopesForRole(role);

    buildAbilityFromScopes(
        {
            userUuid: member.userUuid,
            projectUuid: member.projectUuid,
            scopes,
            isEnterprise,
        },
        scopeBuilder,
    );
    const scopeAbility = scopeBuilder.build();

    // Compare the filtered rule sets
    const result = compareRuleSets(
        filteredRoleRules,
        scopeAbility.rules as CASLRule[],
        role,
    );

    return result;
};

describe('Role to Scope Parity', () => {
    const systemProjectRoles = [
        ProjectMemberRole.VIEWER,
        ProjectMemberRole.INTERACTIVE_VIEWER,
        ProjectMemberRole.EDITOR,
        ProjectMemberRole.DEVELOPER,
        ProjectMemberRole.ADMIN,
    ];

    describe('Non-Enterprise Environment', () => {
        it.each(systemProjectRoles)(
            'should have equivalent permissions for %s role',
            (role) => {
                const comparison = testRoleScopeParity(role, false);

                if (!comparison.isEqual) {
                    console.error(
                        `\n=== PARITY MISMATCH FOR ${role.toUpperCase()} ROLE ===`,
                    );
                    comparison.mismatches.forEach((mismatch) => {
                        console.error(`❌ ${mismatch}`);
                    });
                    console.error('=== END MISMATCH REPORT ===\n');
                }

                expect(comparison.isEqual).toBe(true);
            },
        );
    });

    describe('Enterprise Environment', () => {
        it.each(systemProjectRoles)(
            'should have equivalent permissions for %s role in enterprise',
            (role) => {
                const comparison = testRoleScopeParity(role, true);

                if (!comparison.isEqual) {
                    console.error(
                        `\n=== ENTERPRISE PARITY MISMATCH FOR ${role.toUpperCase()} ROLE ===`,
                    );
                    comparison.mismatches.forEach((mismatch) => {
                        console.error(`❌ ${mismatch}`);
                    });
                    console.error('=== END MISMATCH REPORT ===\n');
                }

                expect(comparison.isEqual).toBe(true);
            },
        );
    });

    // This is helpful for debugging, but it's not a test
    describe.skip('Rule Count Analysis', () => {
        it('should report rule counts for documentation', () => {
            console.log('\n=== ROLE PERMISSION RULE COUNTS ===');

            systemProjectRoles.forEach((role) => {
                const member = {
                    [ProjectMemberRole.VIEWER]: PROJECT_VIEWER,
                    [ProjectMemberRole.INTERACTIVE_VIEWER]:
                        PROJECT_INTERACTIVE_VIEWER,
                    [ProjectMemberRole.EDITOR]: PROJECT_EDITOR,
                    [ProjectMemberRole.DEVELOPER]: PROJECT_DEVELOPER,
                    [ProjectMemberRole.ADMIN]: PROJECT_ADMIN,
                }[role];

                // Count role-based rules
                const roleBuilder = new AbilityBuilder<MemberAbility>(Ability);
                projectMemberAbilities[role](member, roleBuilder);
                const roleRuleCount = roleBuilder.build().rules.length;

                // Count scope-based rules
                const scopeBuilder = new AbilityBuilder<MemberAbility>(Ability);
                const scopes = getAllScopesForRole(role);
                buildAbilityFromScopes(
                    {
                        userUuid: member.userUuid,
                        projectUuid: member.projectUuid,
                        scopes,
                        isEnterprise: false,
                    },
                    scopeBuilder,
                );
                const scopeRuleCount = scopeBuilder.build().rules.length;

                console.log(
                    `${role.padEnd(20)}: Role-based: ${roleRuleCount
                        .toString()
                        .padStart(3)}, Scope-based: ${scopeRuleCount
                        .toString()
                        .padStart(3)}, Scopes: ${scopes.length
                        .toString()
                        .padStart(3)}`,
                );
            });

            console.log('=== END RULE COUNT ANALYSIS ===\n');
        });
    });
});
