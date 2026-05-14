/* eslint-disable no-console */
import { Ability, AbilityBuilder } from '@casl/ability';
import { type OrganizationMemberRole } from '../types/organizationMemberProfile';
import { ProjectMemberRole } from '../types/projectMemberRole';
import { applyOrganizationMemberStaticAbilities } from './organizationMemberAbility';
import {
    ORGANIZATION_ADMIN,
    ORGANIZATION_DEVELOPER,
    ORGANIZATION_EDITOR,
    ORGANIZATION_INTERACTIVE_VIEWER,
    ORGANIZATION_VIEWER,
} from './organizationMemberAbility.mock';
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
import { getScopes } from './scopes';
import { type MemberAbility } from './types';

type CASLRule = {
    action: string;
    subject: string;
    conditions?: Record<string, unknown>;
    inverted?: boolean;
    reason?: string;
};

/**
 * Coverage check: every `${action}:${subject}` key that the role-based
 * ability emits must also appear in the scope-based ability. Extras on
 * the scope side are allowed — they represent granular toggles that
 * either subsume into a broader role grant (e.g. `manage:Job` covers
 * `create:Job` + `view:Job`) or unlock org-level abilities the project
 * role doesn't carry. Those extras are validated by the separate
 * scope-vocabulary coverage test.
 *
 * Why not strict equivalence: role-based and scope-based deliberately
 * emit different *condition shapes* for the same action+subject (CASL
 * inheritance, `userUuid` filters, etc.). Comparing rule counts or
 * conditions exactly is brittle and tests architectural detail rather
 * than the property we care about — "no role-granted ability is
 * unreachable through scopes."
 */
const checkRoleCoveredByScopes = (
    roleBasedRules: CASLRule[],
    scopeBasedRules: CASLRule[],
    roleName: string,
): { isEqual: boolean; mismatches: string[] } => {
    const roleKeys = new Set(
        roleBasedRules.map((r) => `${r.action}:${r.subject}`),
    );
    const scopeKeys = new Set(
        scopeBasedRules.map((r) => `${r.action}:${r.subject}`),
    );
    const missingInScope = [...roleKeys].filter((k) => !scopeKeys.has(k));
    return {
        isEqual: missingInScope.length === 0,
        mismatches: missingInScope.map(
            (k) =>
                `Role ${roleName} grants "${k}" but no scope in BASE_ROLE_SCOPES emits a rule for it`,
        ),
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
    'PreAggregation',
    // The matching scopes (`view:` + `manage:OrganizationWarehouseCredentials`)
    // are `isEnterprise: true` in scopes.ts, so the scope-build path
    // strips them in non-enterprise mode. Mirror that filter on the
    // role-based side so non-enterprise parity stays clean — at runtime
    // the feature is gated by license anyway.
    'OrganizationWarehouseCredentials',
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
 * `${action}:${subject}` pairs that we expect on the **scope-built** side
 * but NOT on the **project-role-built** side, when comparing project
 * parity. Two reasons something lands here:
 *
 * 1. **Org-only subject** — the subject never appears in any project
 *    ability (e.g. `manage:OrganizationMemberProfile`,
 *    `manage:Group`, `impersonate:User`). The scope-built rule for
 *    these in project context is dead-on-arrival (`{ projectUuid }`
 *    conditions never match `{ organizationUuid }`-keyed subjects),
 *    but we keep the toggle in `BASE_ROLE_SCOPES` so admin custom
 *    roles surface it at org-level assignment. See
 *    `docs/authentication-and-roles.md`.
 *
 * 2. **Granular action of a subject covered by `manage:X` at project
 *    level** — e.g. project ability grants `manage:Job` (which CASL
 *    expands to cover `create`/`view`/`update`/`delete`), while the
 *    scope vocabulary lists `create:Job` and `view:Job@self` as
 *    separate scopes. The scope-built rules are benign extras — at
 *    runtime they're subsumed by the broader `manage:Job` already
 *    in role-based.
 *
 * Subjects with `*` mean "all actions on this subject," used for
 * org-only subjects (case 1).
 */
const PROJECT_PARITY_IGNORE = new Set([
    // Case 1: org-only subjects.
    '*:OrganizationMemberProfile',
    '*:Organization',
    '*:Group',
    '*:InviteLink',
    '*:GitIntegration',
    '*:OrganizationWarehouseCredentials',
    '*:User', // impersonate:User

    // Case 2: granular actions subsumed by project's broader `manage:X`.
    'create:Job',
    'view:Job',
    'manage:SemanticViewer', // broad org-only; @space variant is project
    'create:VirtualView',
    'delete:VirtualView',
    'promote:Dashboard',
    'promote:SavedChart',
    'promote:Dashboard@space',
    'promote:SavedChart@space',
]);

const isProjectParityIgnored = (rule: CASLRule): boolean => {
    const key = `${rule.action}:${rule.subject}`;
    return (
        PROJECT_PARITY_IGNORE.has(key) ||
        PROJECT_PARITY_IGNORE.has(`*:${rule.subject}`)
    );
};

/**
 * Test project-context parity for a role.
 *
 * Compares `projectMemberAbilities[role]` against
 * `buildAbilityFromScopes(scopes, { projectUuid })`. Org-only subjects
 * are filtered out of the scope-built side because their rules at
 * project context are dead-on-arrival (`{ projectUuid }` conditions
 * never match `{ organizationUuid }`-keyed subjects) — the role-builder
 * UI still surfaces them for org-level assignment, but project parity
 * shouldn't fail on them.
 */
const testProjectRoleScopeParity = (
    role: ProjectMemberRole,
    isEnterprise: boolean = false,
): { isEqual: boolean; mismatches: string[] } => {
    const member = {
        [ProjectMemberRole.VIEWER]: PROJECT_VIEWER,
        [ProjectMemberRole.INTERACTIVE_VIEWER]: PROJECT_INTERACTIVE_VIEWER,
        [ProjectMemberRole.EDITOR]: PROJECT_EDITOR,
        [ProjectMemberRole.DEVELOPER]: PROJECT_DEVELOPER,
        [ProjectMemberRole.ADMIN]: PROJECT_ADMIN,
    }[role];

    const roleBuilder = new AbilityBuilder<MemberAbility>(Ability);
    projectMemberAbilities[role](member, roleBuilder);
    const filteredRoleRules = filterEnterpriseRules(
        roleBuilder.build().rules as CASLRule[],
        isEnterprise,
    );

    const scopeBuilder = new AbilityBuilder<MemberAbility>(Ability);
    buildAbilityFromScopes(
        {
            userUuid: member.userUuid,
            projectUuid: member.projectUuid,
            scopes: getAllScopesForRole(role),
            isEnterprise,
        },
        scopeBuilder,
    );
    const scopeRules = (scopeBuilder.build().rules as CASLRule[]).filter(
        (r) => !isProjectParityIgnored(r),
    );

    return checkRoleCoveredByScopes(
        filteredRoleRules,
        scopeRules,
        `${role} (project)`,
    );
};

/**
 * Test org-context parity for a role.
 *
 * Compares `applyOrganizationMemberStaticAbilities[role]` against
 * `buildAbilityFromScopes(scopes, { organizationUuid })`. This is the
 * second leg the project-only test never had — it catches drift on
 * org-management scopes (which is what let `manage:Group`,
 * `manage:InviteLink`, etc. silently fall out of the scope vocabulary
 * before this PR).
 */
const testOrgRoleScopeParity = (
    role: ProjectMemberRole,
    isEnterprise: boolean = false,
): { isEqual: boolean; mismatches: string[] } => {
    const member = {
        [ProjectMemberRole.VIEWER]: ORGANIZATION_VIEWER,
        [ProjectMemberRole.INTERACTIVE_VIEWER]: ORGANIZATION_INTERACTIVE_VIEWER,
        [ProjectMemberRole.EDITOR]: ORGANIZATION_EDITOR,
        [ProjectMemberRole.DEVELOPER]: ORGANIZATION_DEVELOPER,
        [ProjectMemberRole.ADMIN]: ORGANIZATION_ADMIN,
    }[role];
    const orgRole = role as unknown as OrganizationMemberRole;

    const roleBuilder = new AbilityBuilder<MemberAbility>(Ability);
    applyOrganizationMemberStaticAbilities[orgRole](member, roleBuilder);
    const filteredRoleRules = filterEnterpriseRules(
        roleBuilder.build().rules as CASLRule[],
        isEnterprise,
    );

    const scopeBuilder = new AbilityBuilder<MemberAbility>(Ability);
    buildAbilityFromScopes(
        {
            userUuid: member.userUuid,
            organizationUuid: member.organizationUuid,
            scopes: getAllScopesForRole(role),
            isEnterprise,
        },
        scopeBuilder,
    );
    const scopeRules = scopeBuilder.build().rules as CASLRule[];

    return checkRoleCoveredByScopes(
        filteredRoleRules,
        scopeRules,
        `${role} (org)`,
    );
};

describe('Role to Scope Parity', () => {
    const systemProjectRoles = [
        ProjectMemberRole.VIEWER,
        ProjectMemberRole.INTERACTIVE_VIEWER,
        ProjectMemberRole.EDITOR,
        ProjectMemberRole.DEVELOPER,
        ProjectMemberRole.ADMIN,
    ];

    const reportAndAssert = (
        label: string,
        comparison: { isEqual: boolean; mismatches: string[] },
    ) => {
        if (!comparison.isEqual) {
            console.error(`\n=== ${label} ===`);
            comparison.mismatches.forEach((m) => console.error(`❌ ${m}`));
            console.error('=== END MISMATCH REPORT ===\n');
        }
        expect(comparison.isEqual).toBe(true);
    };

    describe('Project parity (Non-Enterprise)', () => {
        it.each(systemProjectRoles)(
            'project ability ≡ scope build (project context) for %s',
            (role) =>
                reportAndAssert(
                    `PROJECT PARITY MISMATCH FOR ${role.toUpperCase()}`,
                    testProjectRoleScopeParity(role, false),
                ),
        );
    });

    describe('Project parity (Enterprise)', () => {
        it.each(systemProjectRoles)(
            'project ability ≡ scope build (project context) for %s [EE]',
            (role) =>
                reportAndAssert(
                    `ENTERPRISE PROJECT PARITY MISMATCH FOR ${role.toUpperCase()}`,
                    testProjectRoleScopeParity(role, true),
                ),
        );
    });

    describe('Org parity (Non-Enterprise)', () => {
        it.each(systemProjectRoles)(
            'org ability ≡ scope build (org context) for %s',
            (role) =>
                reportAndAssert(
                    `ORG PARITY MISMATCH FOR ${role.toUpperCase()}`,
                    testOrgRoleScopeParity(role, false),
                ),
        );
    });

    describe('Org parity (Enterprise)', () => {
        it.each(systemProjectRoles)(
            'org ability ≡ scope build (org context) for %s [EE]',
            (role) =>
                reportAndAssert(
                    `ENTERPRISE ORG PARITY MISMATCH FOR ${role.toUpperCase()}`,
                    testOrgRoleScopeParity(role, true),
                ),
        );
    });

    // Coverage assertion. The parity tests above only catch drift on
    // scopes that ARE in some role tier — they can't see scopes that
    // exist in the vocabulary (`scopes.ts`) but appear in NO tier.
    // Those would silently render as dead toggles in the role-builder
    // UI. This test enforces that every scope in `scopes.ts` is in
    // `BASE_ROLE_SCOPES` for at least one tier — closing the loop on
    // "how did the misc orphans drift in the first place?".
    describe('Scope vocabulary coverage', () => {
        it('every scope in scopes.ts must appear in at least one role tier', () => {
            const allScopeNames = new Set(
                getScopes({ isEnterprise: true }).map((s) => s.name),
            );
            const tieredScopes = new Set<string>();
            systemProjectRoles.forEach((role) => {
                getAllScopesForRole(role).forEach((s) => tieredScopes.add(s));
            });

            const missing = [...allScopeNames].filter(
                (s) => !tieredScopes.has(s),
            );

            if (missing.length > 0) {
                console.error(
                    '\n=== SCOPES NOT WIRED TO ANY ROLE TIER ===\n' +
                        'Each of these is in `scopes.ts` but in no role tier. ' +
                        'Add them to `BASE_ROLE_SCOPES[<tier>]` in ' +
                        'roleToScopeMapping.ts.\n',
                );
                missing.forEach((s) => console.error(`❌ ${s}`));
                console.error('=== END ===\n');
            }

            expect(missing).toEqual([]);
        });
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
