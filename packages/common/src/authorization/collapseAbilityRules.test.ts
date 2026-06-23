import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { OrganizationMemberRole } from '../types/organizationMemberProfile';
import { ProjectMemberRole } from '../types/projectMemberRole';
import { collapseAbilityRules } from './collapseAbilityRules';
import { getUserAbilityBuilder } from './index';
import { projectMemberAbilities } from './projectMemberAbility';
import { type MemberAbility } from './types';

const USER = 'user-1';

const buildRawRules = (
    projectUuids: string[],
    role: ProjectMemberRole = ProjectMemberRole.ADMIN,
) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    projectUuids.forEach((projectUuid) =>
        projectMemberAbilities[role](
            { role, projectUuid, userUuid: USER },
            builder,
        ),
    );
    return builder.rules;
};

describe('collapseAbilityRules', () => {
    const projects = Array.from({ length: 125 }, (_, i) => `project-${i}`);

    it('collapses thousands of per-project rules to a small set', () => {
        const raw = buildRawRules(projects);
        expect(raw.length).toBeGreaterThan(9000);

        const collapsed = collapseAbilityRules(raw);
        // 125 projects of identical shape collapse to one project's worth of rules
        expect(collapsed.length).toBeLessThan(100);
    });

    it('merges non-projectUuid scalar ids too (e.g. upstreamProjectUuid)', () => {
        const collapsed = collapseAbilityRules(
            buildRawRules(['p1', 'p2', 'p3']),
        );
        const createProject = collapsed.find(
            (r) =>
                r.subject === 'Project' &&
                Boolean(
                    (r.conditions as Record<string, { $in?: string[] }>)
                        ?.upstreamProjectUuid?.$in,
                ),
        );
        expect(createProject).toBeDefined();
        expect(
            (createProject!.conditions as Record<string, { $in: string[] }>)
                .upstreamProjectUuid.$in,
        ).toEqual(['p1', 'p2', 'p3']);
    });

    it.each([
        ProjectMemberRole.VIEWER,
        ProjectMemberRole.INTERACTIVE_VIEWER,
        ProjectMemberRole.EDITOR,
        ProjectMemberRole.DEVELOPER,
        ProjectMemberRole.ADMIN,
    ])(
        'is decision-equivalent for %s across a subject x project x action matrix',
        (role) => {
            const raw = buildRawRules(projects, role);
            const original = new Ability(raw);
            const collapsed = new Ability(collapseAbilityRules(raw));

            const subjects = [...new Set(raw.map((r) => r.subject))];
            const actions = [
                'view',
                'manage',
                'create',
                'update',
                'delete',
            ] as const;
            const testProjects = [...projects.slice(0, 3), 'not-granted'];

            subjects.forEach((s) =>
                testProjects.forEach((projectUuid) =>
                    actions.forEach((action) => {
                        const obj = subject(s as string, {
                            organizationUuid: 'org-1',
                            projectUuid,
                            createdByUserUuid: USER,
                            isPrivate: false,
                            access: [{ userUuid: USER, role: 'admin' }],
                            inheritsFromOrgOrProject: true,
                        });
                        expect(collapsed.can(action, obj)).toBe(
                            original.can(action, obj),
                        );
                    }),
                ),
            );
        },
    );

    it('merges scalar projectUuid rules into a single $in rule', () => {
        const collapsed = collapseAbilityRules(
            buildRawRules(['p1', 'p2', 'p3']),
        );
        const merged = collapsed.find(
            (r) =>
                r.subject === 'Dashboard' &&
                Boolean(
                    (r.conditions as Record<string, { $in?: string[] }>)
                        ?.projectUuid?.$in,
                ),
        );
        expect(merged).toBeDefined();
        expect(
            (merged!.conditions as Record<string, { $in: string[] }>)
                .projectUuid.$in,
        ).toEqual(['p1', 'p2', 'p3']);
    });

    it('dedupes additive duplicate grants (direct + group on same project)', () => {
        const collapsed = collapseAbilityRules(
            buildRawRules(['p1', 'p1', 'p2']),
        );
        const merged = collapsed.find(
            (r) =>
                r.subject === 'Dashboard' &&
                Boolean(
                    (r.conditions as Record<string, { $in?: string[] }>)
                        ?.projectUuid?.$in,
                ),
        );
        expect(
            (merged!.conditions as Record<string, { $in: string[] }>)
                .projectUuid.$in,
        ).toEqual(['p1', 'p2']);
    });

    it('preserves decisions when a duplicate `can` straddles a `cannot` (regression)', () => {
        // CASL is last-relevant-rule-wins: the trailing duplicate `can` re-grants
        // what the `cannot` revoked. Dropping it as an "exact duplicate" would
        // flip view on a private dashboard from allowed to denied.
        const { can, cannot, rules } = new AbilityBuilder<MemberAbility>(
            Ability,
        );
        can('view', 'Dashboard', { projectUuid: 'p2' });
        cannot('view', 'Dashboard', { projectUuid: 'p2', isPrivate: true });
        can('view', 'Dashboard', { projectUuid: 'p2' });

        const original = new Ability(rules);
        const collapsed = new Ability(collapseAbilityRules(rules));

        [true, false].forEach((isPrivate) => {
            const obj = subject('Dashboard', { projectUuid: 'p2', isPrivate });
            expect(collapsed.can('view', obj)).toBe(original.can('view', obj));
        });
        // The private-dashboard case is the one that flips if dedup is unsafe.
        expect(
            collapsed.can(
                'view',
                subject('Dashboard', { projectUuid: 'p2', isPrivate: true }),
            ),
        ).toBe(true);
    });

    it('returns rules untouched when any inverted rule is present', () => {
        const { can, cannot, rules } = new AbilityBuilder<MemberAbility>(
            Ability,
        );
        can('view', 'Dashboard', { projectUuid: 'p1' });
        can('view', 'Dashboard', { projectUuid: 'p2' });
        cannot('manage', 'all'); // global inverted

        expect(collapseAbilityRules(rules)).toEqual(rules);
    });

    it('does not merge a subject that has an inverted rule', () => {
        const { can, cannot, rules } = new AbilityBuilder<MemberAbility>(
            Ability,
        );
        can('view', 'Dashboard', { projectUuid: 'p1' });
        can('view', 'Dashboard', { projectUuid: 'p2' });
        cannot('view', 'Dashboard', { projectUuid: 'p2', isPrivate: true });

        const original = new Ability(rules);
        const collapsed = new Ability(collapseAbilityRules(rules));

        ['p1', 'p2'].forEach((projectUuid) =>
            [true, false].forEach((isPrivate) => {
                const obj = subject('Dashboard', { projectUuid, isPrivate });
                expect(collapsed.can('view', obj)).toBe(
                    original.can('view', obj),
                );
            }),
        );

        // Dashboard had an inverted rule, so its scalar rules stay unmerged
        const merged = collapseAbilityRules(rules).find(
            (r) =>
                r.subject === 'Dashboard' &&
                Boolean(
                    (r.conditions as Record<string, { $in?: string[] }>)
                        ?.projectUuid?.$in,
                ),
        );
        expect(merged).toBeUndefined();
    });

    it('dedups but does not $in-merge when two scalar keys vary independently', () => {
        const { can, rules } = new AbilityBuilder<MemberAbility>(Ability);
        can('view', 'Space', { projectUuid: 'p1', createdByUserUuid: 'a' });
        can('view', 'Space', { projectUuid: 'p2', createdByUserUuid: 'b' });
        can('view', 'Space', { projectUuid: 'p1', createdByUserUuid: 'a' }); // dup

        const collapsed = collapseAbilityRules(rules);
        // The duplicate is removed, the two distinct rules are kept, and no $in
        // is fabricated across the independently-varying keys.
        expect(collapsed).toHaveLength(2);
        collapsed.forEach((r) => {
            expect(
                (r.conditions as Record<string, { $in?: unknown }>).projectUuid
                    .$in,
            ).toBeUndefined();
        });

        // ...and it stays decision-equivalent.
        const original = new Ability(rules);
        const collapsedAbility = new Ability(collapsed);
        ['p1', 'p2', 'p3'].forEach((projectUuid) =>
            ['a', 'b', 'c'].forEach((createdByUserUuid) => {
                const obj = subject('Space', {
                    projectUuid,
                    createdByUserUuid,
                });
                expect(collapsedAbility.can('view', obj)).toBe(
                    original.can('view', obj),
                );
            }),
        );
    });

    describe('single-scalar merge cases', () => {
        const spaceRules = (conds: Record<string, unknown>[]) => {
            const { can, rules } = new AbilityBuilder<MemberAbility>(Ability);
            conds.forEach((c) => can('view', 'Space', c));
            return rules;
        };

        const assertEquivalent = (
            rules: Parameters<typeof collapseAbilityRules>[0],
        ) => {
            const original = new Ability(rules);
            const collapsed = new Ability(collapseAbilityRules(rules));
            ['p1', 'p2', 'p3'].forEach((projectUuid) =>
                ['a', 'b', 'c'].forEach((createdByUserUuid) => {
                    const obj = subject('Space', {
                        projectUuid,
                        createdByUserUuid,
                    });
                    expect(collapsed.can('view', obj)).toBe(
                        original.can('view', obj),
                    );
                }),
            );
        };

        it('merges on createdByUserUuid when only it varies (2 -> 1)', () => {
            const rules = spaceRules([
                { projectUuid: 'p1', createdByUserUuid: 'a' },
                { projectUuid: 'p1', createdByUserUuid: 'b' },
            ]);
            const out = collapseAbilityRules(rules);
            expect(out).toHaveLength(1);
            expect(out[0].conditions).toEqual({
                projectUuid: 'p1',
                createdByUserUuid: { $in: ['a', 'b'] },
            });
            assertEquivalent(rules);
        });

        it('merges on projectUuid when only it varies (2 -> 1)', () => {
            const rules = spaceRules([
                { projectUuid: 'p1', createdByUserUuid: 'b' },
                { projectUuid: 'p2', createdByUserUuid: 'b' },
            ]);
            const out = collapseAbilityRules(rules);
            expect(out).toHaveLength(1);
            expect(out[0].conditions).toEqual({
                projectUuid: { $in: ['p1', 'p2'] },
                createdByUserUuid: 'b',
            });
            assertEquivalent(rules);
        });

        it('leaves rules separate when two keys vary across the group (3 -> 3)', () => {
            const rules = spaceRules([
                { projectUuid: 'p1', createdByUserUuid: 'a' },
                { projectUuid: 'p1', createdByUserUuid: 'b' },
                { projectUuid: 'p2', createdByUserUuid: 'b' },
            ]);
            const out = collapseAbilityRules(rules);
            expect(out).toHaveLength(3);
            out.forEach((r) =>
                expect(
                    (r.conditions as Record<string, { $in?: unknown }>)
                        .projectUuid.$in,
                ).toBeUndefined(),
            );
            assertEquivalent(rules);
        });

        it('merges only the group whose lone key varies, mixed key sets (5 -> 4)', () => {
            const rules = spaceRules([
                { projectUuid: 'p1', createdByUserUuid: 'a' },
                { projectUuid: 'p1', createdByUserUuid: 'b' },
                { projectUuid: 'p2', createdByUserUuid: 'b' },
                { projectUuid: 'p1' },
                { projectUuid: 'p2' },
            ]);
            const out = collapseAbilityRules(rules);
            expect(out).toHaveLength(4);
            // The projectUuid-only rules collapse; the two-key rules do not.
            const merged = out.find(
                (r) =>
                    (r.conditions as Record<string, { $in?: string[] }>)
                        .projectUuid?.$in !== undefined &&
                    !('createdByUserUuid' in (r.conditions as object)),
            );
            expect(merged).toBeDefined();
            expect(
                (merged!.conditions as Record<string, { $in: string[] }>)
                    .projectUuid.$in,
            ).toEqual(['p1', 'p2']);
            assertEquivalent(rules);
        });
    });

    it('premise: production ability builders emit no inverted (cannot) rules', () => {
        // The collapse is only sound for positive-only rule sets. This guards
        // that premise: if any role/scope builder ever adds a cannot() rule
        // definition, collapse silently stops collapsing — fail loudly here.
        const orgRoles = Object.values(OrganizationMemberRole);
        const projectRoles = Object.values(ProjectMemberRole);

        orgRoles.forEach((role) => {
            const { builder } = getUserAbilityBuilder({
                user: {
                    role,
                    organizationUuid: 'org-1',
                    userUuid: USER,
                    roleUuid: undefined,
                },
                projectProfiles: projectRoles.map((projectRole, i) => ({
                    projectUuid: `project-${i}`,
                    role: projectRole,
                    userUuid: USER,
                    roleUuid: undefined,
                })),
                permissionsConfig: {
                    pat: { enabled: true, allowedOrgRoles: orgRoles },
                },
            });
            expect(builder.rules.some((r) => r.inverted)).toBe(false);
        });

        // Custom-role / scope path.
        const { builder } = getUserAbilityBuilder({
            user: {
                role: OrganizationMemberRole.MEMBER,
                organizationUuid: 'org-1',
                userUuid: USER,
                roleUuid: undefined,
            },
            projectProfiles: [
                {
                    projectUuid: 'project-0',
                    role: ProjectMemberRole.ADMIN,
                    userUuid: USER,
                    roleUuid: 'custom-role',
                },
            ],
            permissionsConfig: { pat: { enabled: false, allowedOrgRoles: [] } },
            customRoleScopes: {
                'custom-role': ['view:Dashboard', 'manage:Space'],
            },
            customRolesEnabled: true,
        });
        expect(builder.rules.some((r) => r.inverted)).toBe(false);
    });
});
