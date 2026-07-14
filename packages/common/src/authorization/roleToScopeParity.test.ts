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
    'OrganizationAiAgent',
    'AiAgentDocument',
    'AiAgentThread',
    'AiDeepResearch',
    'ContentAsCode',
    'PreAggregation',
    'ExternalConnection',
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
 * Test org-context parity for a role.
 *
 * Compares `applyOrganizationMemberStaticAbilities[role]` against
 * `buildAbilityFromScopes(scopes, { organizationUuid })`. Project-role
 * parity no longer needs a test: `projectMemberAbilities` is built FROM
 * the scope mapping, so it can't drift. Org static abilities are still
 * hand-written, so this leg remains — it catches drift on
 * org-management scopes (`manage:Group`, `manage:InviteLink`, etc.).
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
});
