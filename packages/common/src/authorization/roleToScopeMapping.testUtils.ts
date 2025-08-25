/* eslint-disable no-console */
import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { ProjectMemberRole } from '../types/projectMemberRole';
import { projectMemberAbilities } from './projectMemberAbility';
import {
    getAllScopesForRole,
    getNonEnterpriseScopesForRole,
} from './roleToScopeMapping';
import { buildAbilityFromScopes } from './scopeAbilityBuilder';
import { type MemberAbility } from './types';

/**
 * Test utilities for role to scope mapping validation
 * These functions are only used for testing migration compatibility
 */

/**
 * Validates that a role properly inherits permissions from lower roles
 */
export const validateRoleInheritance = (): {
    valid: boolean;
    errors: string[];
} => {
    const errors: string[] = [];
    const roleOrder = [
        ProjectMemberRole.VIEWER,
        ProjectMemberRole.INTERACTIVE_VIEWER,
        ProjectMemberRole.EDITOR,
        ProjectMemberRole.DEVELOPER,
        ProjectMemberRole.ADMIN,
    ];

    for (let i = 1; i < roleOrder.length; i += 1) {
        const currentRole = roleOrder[i];
        const previousRole = roleOrder[i - 1];

        const currentScopes = new Set(getAllScopesForRole(currentRole));
        const previousScopes = getAllScopesForRole(previousRole);

        // Check that all previous scopes are included in current role
        for (const scope of previousScopes) {
            if (!currentScopes.has(scope)) {
                errors.push(
                    `Role ${currentRole} is missing inherited scope: ${scope} from ${previousRole}`,
                );
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
};

/**
 * Extracts the actual permissions granted by a role builder for analysis and comparison
 * This is useful for debugging and validating that our scope mappings are correct
 */
export const extractRolePermissions = (
    role: ProjectMemberRole,
): {
    rules: Array<{
        action: string;
        subject: string;
        conditions?: unknown;
        inverted?: boolean;
        reason?: string;
    }>;
    rawAbility: MemberAbility;
} => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    const testMember = {
        role,
        projectUuid: 'test-project-uuid',
        userUuid: 'test-user-uuid',
    };

    // Build the ability using the role-based system
    projectMemberAbilities[role](testMember, builder);
    const ability = builder.build();

    // Extract the rules for analysis
    return {
        rules: ability.rules.map((rule) => ({
            action: rule.action as string,
            subject: rule.subject as string,
            conditions: rule.conditions,
            inverted: rule.inverted,
            reason: rule.reason,
        })),
        rawAbility: ability,
    };
};

/**
 * Helper function to create standardized test cases for role compatibility testing
 */
export const createStandardTestCases = () => [
    // View permissions
    {
        action: 'view' as const,
        subject: 'Dashboard' as const,
        resource: {
            organizationUuid: 'org-uuid-test',
            projectUuid: 'test-project-uuid',
            isPrivate: false,
        },
    },
    {
        action: 'view' as const,
        subject: 'SavedChart' as const,
        resource: {
            organizationUuid: 'org-uuid-test',
            projectUuid: 'test-project-uuid',
            isPrivate: false,
        },
    },
    {
        action: 'view' as const,
        subject: 'Space' as const,
        resource: {
            organizationUuid: 'org-uuid-test',
            projectUuid: 'test-project-uuid',
            isPrivate: false,
        },
    },
    {
        action: 'view' as const,
        subject: 'Project' as const,
        resource: { projectUuid: 'test-project-uuid' },
    },

    // Create permissions
    {
        action: 'create' as const,
        subject: 'Space' as const,
        resource: {
            organizationUuid: 'org-uuid-test',
            projectUuid: 'test-project-uuid',
        },
    },
    {
        action: 'create' as const,
        subject: 'DashboardComments' as const,
        resource: { projectUuid: 'test-project-uuid' },
    },
    {
        action: 'create' as const,
        subject: 'ScheduledDeliveries' as const,
        resource: { projectUuid: 'test-project-uuid' },
    },

    // Manage permissions (varies by role level)
    {
        action: 'manage' as const,
        subject: 'Space' as const,
        resource: {
            organizationUuid: 'org-uuid-test',
            projectUuid: 'test-project-uuid',
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
            projectUuid: 'test-project-uuid',
        },
    },
    {
        action: 'manage' as const,
        subject: 'Explore' as const,
        resource: { projectUuid: 'test-project-uuid' },
    },

    // Higher-level permissions (developer+ only)
    {
        action: 'manage' as const,
        subject: 'Project' as const,
        resource: { projectUuid: 'test-project-uuid' },
    },
    {
        action: 'manage' as const,
        subject: 'Validation' as const,
        resource: { projectUuid: 'test-project-uuid' },
    },
    {
        action: 'manage' as const,
        subject: 'VirtualView' as const,
        resource: { projectUuid: 'test-project-uuid' },
    },
    {
        action: 'manage' as const,
        subject: 'CustomSql' as const,
        resource: { projectUuid: 'test-project-uuid' },
    },

    // Admin-only permissions
    {
        action: 'delete' as const,
        subject: 'Project' as const,
        resource: { projectUuid: 'test-project-uuid' },
    },
    {
        action: 'view' as const,
        subject: 'Analytics' as const,
        resource: { projectUuid: 'test-project-uuid' },
    },
];

/**
 * Helper function to create test parameters for role compatibility testing
 */
export const createRoleTestParams = (
    role: ProjectMemberRole,
    options: {
        isEnterprise?: boolean;
        projectUuid?: string;
        userUuid?: string;
        organizationUuid?: string;
    } = {},
) => {
    const {
        isEnterprise = false,
        projectUuid = 'test-project-uuid',
        userUuid = 'test-user-uuid',
        organizationUuid = 'test-org-uuid',
    } = options;

    const scopes = isEnterprise
        ? getAllScopesForRole(role)
        : getNonEnterpriseScopesForRole(role);

    const scopeBuilderParams = {
        userUuid,
        scopes,
        isEnterprise,
        organizationRole: 'editor' as const,
        permissionsConfig: {
            pat: {
                enabled: false,
                allowedOrgRoles: [],
            },
        },
    };

    return {
        role,
        scopes,
        projectMember: {
            role,
            projectUuid,
            userUuid,
        },
        scopeOrgBuilderParams: {
            ...scopeBuilderParams,
            organizationUuid,
        },
        scopeProjectBuilderParams: {
            ...scopeBuilderParams,
            projectUuid,
        },
    };
};

/**
 * Compares role-based and scope-based abilities for a specific set of test cases
 * Returns detailed results showing which permissions match or differ
 */
export const compareRoleAndScopeAbilities = (
    role: ProjectMemberRole,
    testCases: ReturnType<typeof createStandardTestCases>,
    options: { isEnterprise?: boolean } = {},
) => {
    const { isEnterprise = false } = options;
    const testParams = createRoleTestParams(role, { isEnterprise });

    // Build role-based ability
    const roleBuilder = new AbilityBuilder<MemberAbility>(Ability);
    projectMemberAbilities[role](testParams.projectMember, roleBuilder);
    const roleAbility = roleBuilder.build();

    // Build Project-based scope-based ability
    const scopeBuilder = new AbilityBuilder<MemberAbility>(Ability);
    buildAbilityFromScopes(testParams.scopeProjectBuilderParams, scopeBuilder);
    const scopeAbility = scopeBuilder.build();

    const results = testCases.map((testCase) => {
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

        return {
            ...testCase,
            roleResult,
            scopeResult,
            match: roleResult === scopeResult,
        };
    });

    const summary = {
        total: results.length,
        matches: results.filter((r) => r.match).length,
        mismatches: results.filter((r) => !r.match),
        allMatch: results.every((r) => r.match),
    };

    return {
        role,
        scopes: testParams.scopes,
        results,
        summary,
    };
};

/**
 * Runs a comprehensive comparison of all roles against standard test cases
 */
export const validateAllRoleMappings = (
    options: { isEnterprise?: boolean } = {},
) => {
    const roles = [
        ProjectMemberRole.VIEWER,
        ProjectMemberRole.INTERACTIVE_VIEWER,
        ProjectMemberRole.EDITOR,
        ProjectMemberRole.DEVELOPER,
        ProjectMemberRole.ADMIN,
    ];

    const testCases = createStandardTestCases();
    const results = roles.map((role) =>
        compareRoleAndScopeAbilities(role, testCases, options),
    );

    const overallSummary = {
        rolesValidated: results.length,
        successfulRoles: results
            .filter((r) => r.summary.allMatch)
            .map((r) => r.role),
        failedRoles: results
            .filter((r) => !r.summary.allMatch)
            .map((r) => ({
                role: r.role,
                mismatches: r.summary.mismatches.length,
            })),
        totalTestCases: results.reduce((sum, r) => sum + r.summary.total, 0),
        totalMatches: results.reduce((sum, r) => sum + r.summary.matches, 0),
    };

    return {
        roleResults: results,
        overallSummary,
        allRolesValid: overallSummary.failedRoles.length === 0,
    };
};

/**
 * Debug utility to show what scopes are missing or extra for a specific role
 */
export const debugRoleScopeMapping = (role: ProjectMemberRole) => {
    const testCases = createStandardTestCases();
    const comparison = compareRoleAndScopeAbilities(role, testCases);

    const mismatches = comparison.results.filter((r) => !r.match);

    console.debug(`\n=== Debug: ${role} Role Scope Mapping ===`);
    console.debug(`Scopes assigned: ${comparison.scopes.length}`);
    console.debug(`Test cases: ${comparison.summary.total}`);
    console.debug(`Matches: ${comparison.summary.matches}`);
    console.debug(`Mismatches: ${mismatches.length}`);

    if (mismatches.length > 0) {
        console.debug('\n--- Mismatched Permissions ---');
        mismatches.forEach((mismatch) => {
            console.debug(`${mismatch.action}:${mismatch.subject}`);
            console.debug(`  Role-based: ${mismatch.roleResult}`);
            console.debug(`  Scope-based: ${mismatch.scopeResult}`);
            console.debug(`  Resource:`, mismatch.resource);
            console.debug('');
        });
    }

    console.debug(`\nAssigned Scopes:`);
    comparison.scopes.forEach((scope) => console.debug(`  - ${scope}`));

    return comparison;
};
