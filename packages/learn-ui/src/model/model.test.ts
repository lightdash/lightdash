import { describe, expect, it } from 'vitest';
import {
    OrganizationMemberRole,
    ProjectMemberRole,
    ScopeGroup,
} from '../scope/types';
import {
    createBoardModel,
    ctaLabel,
    defaultRoleFor,
    holds,
    lessonsDone,
    moduleDone,
    moduleProgress,
    parseScopeTag,
    plural,
    SYSTEM_ROLES,
} from './model';
import { emptyRollup, type Rollup } from './rollup';
import { commonScopeSource, entry } from './testFixtures';

const model = createBoardModel(commonScopeSource);
const getAllScopesForRole = commonScopeSource.getAllScopesForRole;

const rollup = (overrides: Partial<Rollup>): Rollup => ({
    ...emptyRollup(),
    ...overrides,
});

describe('parseScopeTag / holds', () => {
    it('splits the @global marker off the base', () => {
        expect(parseScopeTag('manage:ScheduledDeliveries@global')).toEqual({
            base: 'manage:ScheduledDeliveries',
            global: true,
        });
        expect(parseScopeTag('view:Project')).toEqual({
            base: 'view:Project',
            global: false,
        });
    });

    it('a bare tag is held by the scope under any modifier', () => {
        expect(holds(['manage:Dashboard@space'], 'manage:Dashboard')).toBe(
            true,
        );
        expect(holds(['manage:Dashboard'], 'manage:Dashboard')).toBe(true);
        expect(holds(['view:Dashboard'], 'manage:Dashboard')).toBe(false);
        expect(holds([], 'manage:Dashboard')).toBe(false);
    });

    it('a @global tag is held only by the unmodified scope', () => {
        expect(
            holds(
                ['manage:ScheduledDeliveries@self'],
                'manage:ScheduledDeliveries@global',
            ),
        ).toBe(false);
        expect(
            holds(
                ['manage:ScheduledDeliveries'],
                'manage:ScheduledDeliveries@global',
            ),
        ).toBe(true);
    });
});

describe('groupOf', () => {
    it('regroups view:Project as foundations', () => {
        expect(model.groupOf(entry({ id: 'a', scope: 'view:Project' }))).toBe(
            'foundations',
        );
    });

    it('uses the scope registry group otherwise', () => {
        expect(
            model.groupOf(entry({ id: 'b', scope: 'manage:Dashboard' })),
        ).toBe(ScopeGroup.CONTENT);
        expect(
            model.groupOf(entry({ id: 'c', scope: 'manage:Organization' })),
        ).toBe(ScopeGroup.ORGANIZATION_MANAGEMENT);
    });

    it('falls back to foundations for null or unknown scopes', () => {
        expect(model.groupOf(entry({ id: 'd', scope: null }))).toBe(
            'foundations',
        );
        expect(
            model.groupOf(entry({ id: 'e', scope: 'manage:NotAThing' })),
        ).toBe('foundations');
    });
});

describe('courseFor / isUnlocked / heldBy', () => {
    const library = [
        entry({ id: 'foundation', scope: 'view:Project' }),
        entry({ id: 'dashboards', scope: 'manage:Dashboard' }),
        entry({ id: 'org', scope: 'manage:Organization' }),
        entry({ id: 'untagged', scope: null }),
    ];

    it('a viewer gets the foundations and untagged modules only', () => {
        const ids = model
            .courseFor(library, getAllScopesForRole(ProjectMemberRole.VIEWER))
            .map((e) => e.id);
        expect(ids).toEqual(['foundation', 'untagged']);
    });

    it('an admin gets everything', () => {
        expect(
            model.courseFor(
                library,
                getAllScopesForRole(ProjectMemberRole.ADMIN),
            ),
        ).toHaveLength(4);
    });

    it('untagged modules are unlocked for everyone', () => {
        expect(model.isUnlocked(entry({ id: 'x', scope: null }), [])).toBe(
            true,
        );
    });

    it('an unknown scope is unlocked for everyone, not vanished', () => {
        const stale = entry({ id: 'stale', scope: 'manage:Nonexistent' });
        expect(
            SYSTEM_ROLES.every((role) =>
                model.isUnlocked(stale, getAllScopesForRole(role)),
            ),
        ).toBe(true);
        expect(
            model.courseFor(
                [stale],
                getAllScopesForRole(ProjectMemberRole.VIEWER),
            ),
        ).toHaveLength(1);
        expect(model.heldBy(stale)).toEqual(SYSTEM_ROLES);
    });

    it('lists the system roles that hold the module', () => {
        expect(
            model.heldBy(entry({ id: 'org', scope: 'manage:Organization' })),
        ).toEqual([ProjectMemberRole.ADMIN]);
        expect(
            model.heldBy(entry({ id: 'f', scope: 'view:Project' })),
        ).toHaveLength(5);
    });
});

describe('the @global marker against the real role scope sets', () => {
    const BASE = 'manage:ScheduledDeliveries';
    const globalTagged = entry({ id: 'deliveries', scope: `${BASE}@global` });
    const bareTagged = entry({ id: 'deliveries-bare', scope: BASE });
    const unmodified = SYSTEM_ROLES.filter((role) =>
        getAllScopesForRole(role).includes(BASE),
    );
    const modifiedOnly = SYSTEM_ROLES.filter((role) => {
        const held = getAllScopesForRole(role);
        return (
            !held.includes(BASE) && held.some((s) => s.startsWith(`${BASE}@`))
        );
    });

    it('is held by exactly the roles whose real scope set has the unmodified scope', () => {
        expect(unmodified.length).toBeGreaterThan(0);
        expect(unmodified.length).toBeLessThan(SYSTEM_ROLES.length);
        expect(model.heldBy(globalTagged)).toEqual(unmodified);
        unmodified.forEach((role) =>
            expect(
                model.isUnlocked(globalTagged, getAllScopesForRole(role)),
            ).toBe(true),
        );
    });

    it('a role holding only a modified variant holds the bare tag but not @global', () => {
        expect(modifiedOnly.length).toBeGreaterThan(0);
        modifiedOnly.forEach((role) => {
            const held = getAllScopesForRole(role);
            expect(model.isUnlocked(globalTagged, held)).toBe(false);
            expect(model.isUnlocked(bareTagged, held)).toBe(true);
        });
    });
});

describe('scopePermits / defaultRoleFor', () => {
    it('returns the registry description for a known scope', () => {
        expect(
            model.scopePermits(entry({ id: 'a', scope: 'manage:Dashboard' })),
        ).toMatch(/dashboard/i);
        expect(model.scopePermits(entry({ id: 'b', scope: null }))).toBeNull();
    });

    it('maps org roles onto the board roles, member and unknown to viewer', () => {
        expect(defaultRoleFor(OrganizationMemberRole.EDITOR)).toBe(
            ProjectMemberRole.EDITOR,
        );
        expect(defaultRoleFor(OrganizationMemberRole.MEMBER)).toBe(
            ProjectMemberRole.VIEWER,
        );
        expect(defaultRoleFor(undefined)).toBe(ProjectMemberRole.VIEWER);
    });
});

describe('moduleProgress / lessonsDone', () => {
    const m = entry({ id: 'm', lessonCount: 4 });

    it('is 0 without a rollup and 1 when completed regardless of lessons', () => {
        expect(moduleProgress(m, undefined)).toBe(0);
        expect(moduleProgress(m, rollup({ completed: true }))).toBe(1);
        expect(lessonsDone(m, rollup({ completed: true }))).toBe(4);
    });

    it('is the completed-lesson fraction otherwise, capped at the lesson count', () => {
        expect(
            moduleProgress(
                m,
                rollup({ lessonsCompleted: new Set(['a', 'b']) }),
            ),
        ).toBe(0.5);
        expect(
            lessonsDone(
                m,
                rollup({
                    lessonsCompleted: new Set(['a', 'b', 'c', 'd', 'e']),
                }),
            ),
        ).toBe(4);
    });

    it('treats a zero-lesson module as not started', () => {
        expect(
            moduleProgress(
                entry({ id: 'z', lessonCount: 0 }),
                rollup({ started: true }),
            ),
        ).toBe(0);
    });

    it('stops one step short of 1 when every lesson is read but the quiz is not passed', () => {
        const reachedQuiz = rollup({
            lessonsCompleted: new Set(['a', 'b', 'c', 'd']),
        });
        expect(moduleProgress(m, reachedQuiz)).toBeCloseTo(4 / 5, 10);
        expect(moduleDone(reachedQuiz)).toBe(false);
    });

    it('only the completed flag reads as done', () => {
        expect(moduleDone(undefined)).toBe(false);
        expect(moduleDone(rollup({ completed: true }))).toBe(true);
    });
});

describe('railModel', () => {
    const library = [
        entry({ id: 'f1', scope: 'view:Project', lessonCount: 2 }),
        entry({ id: 'f2', scope: 'view:Project', lessonCount: 2 }),
        entry({ id: 'c1', scope: 'manage:Dashboard', lessonCount: 4 }),
        entry({ id: 'c2', scope: 'manage:Dashboard', lessonCount: 4 }),
        entry({ id: 'o1', scope: 'manage:Organization', lessonCount: 1 }),
    ];
    const rollups = new Map<string, Rollup>([
        ['f1', rollup({ completed: true })],
        ['c1', rollup({ lessonsCompleted: new Set(['x']) })],
        ['c2', rollup({ lessonsCompleted: new Set(['x', 'y', 'z']) })],
        ['o1', rollup({ completed: true })],
    ]);

    it('filters to the held course and orders by group', () => {
        const rail = model.railModel(
            library,
            getAllScopesForRole(ProjectMemberRole.EDITOR),
            rollups,
        );
        expect(rail.mine.map((m) => m.entry.id)).toEqual([
            'f1',
            'f2',
            'c1',
            'c2',
        ]);
    });

    it('rolls up lessons and completed modules over the held course only', () => {
        const rail = model.railModel(
            library,
            getAllScopesForRole(ProjectMemberRole.EDITOR),
            rollups,
        );
        expect(rail.overall).toEqual({
            doneLessons: 2 + 1 + 3,
            totalLessons: 12,
            pct: 50,
            modulesComplete: 1,
        });
    });

    it('queues in-flight modules by progress desc, then not-started', () => {
        const rail = model.railModel(
            library,
            getAllScopesForRole(ProjectMemberRole.EDITOR),
            rollups,
        );
        expect(rail.queue.map((m) => m.entry.id)).toEqual(['c2', 'c1', 'f2']);
        expect(rail.nextUpId).toBe('c2');
    });

    it('caps the queue at four, in-flight first', () => {
        const many = Array.from({ length: 6 }, (_, i) =>
            entry({ id: `n${i}`, scope: 'view:Project', lessonCount: 2 }),
        );
        const rail = model.railModel(
            many,
            getAllScopesForRole(ProjectMemberRole.VIEWER),
            new Map([['n5', rollup({ lessonsCompleted: new Set(['a']) })]]),
        );
        expect(rail.queue.map((m) => m.entry.id)).toEqual([
            'n5',
            'n0',
            'n1',
            'n2',
        ]);
    });

    it('keeps a module whose lessons are all read but quiz unpassed in the queue', () => {
        const lib = [
            entry({ id: 'q1', scope: 'view:Project', lessonCount: 2 }),
        ];
        const rail = model.railModel(
            lib,
            getAllScopesForRole(ProjectMemberRole.VIEWER),
            new Map([
                ['q1', rollup({ lessonsCompleted: new Set(['a', 'b']) })],
            ]),
        );
        expect(rail.mine[0].progress).toBeLessThan(1);
        expect(rail.mine[0].done).toBe(false);
        expect(rail.queue.map((m) => m.entry.id)).toEqual(['q1']);
        expect(rail.completed).toEqual([]);
        expect(rail.overall.modulesComplete).toBe(0);
    });

    it('marks a module done only on the completed flag', () => {
        const lib = [
            entry({ id: 'q1', scope: 'view:Project', lessonCount: 2 }),
        ];
        const rail = model.railModel(
            lib,
            getAllScopesForRole(ProjectMemberRole.VIEWER),
            new Map([['q1', rollup({ completed: true })]]),
        );
        expect(rail.mine[0]).toMatchObject({ progress: 1, done: true });
        expect(rail.completed.map((m) => m.entry.id)).toEqual(['q1']);
        expect(rail.queue).toEqual([]);
    });

    it('keeps completed modules in the rail even when the role no longer holds them', () => {
        const rail = model.railModel(
            library,
            getAllScopesForRole(ProjectMemberRole.EDITOR),
            rollups,
        );
        expect(rail.completed.map((m) => m.entry.id)).toEqual(['f1', 'o1']);
        const viewer = model.railModel(
            library,
            getAllScopesForRole(ProjectMemberRole.VIEWER),
            rollups,
        );
        expect(viewer.mine.map((m) => m.entry.id)).toEqual(['f1', 'f2']);
        expect(viewer.completed.map((m) => m.entry.id)).toEqual(['f1', 'o1']);
        expect(viewer.overall.modulesComplete).toBe(1);
    });

    it('next up falls back to the first not-started, then to null', () => {
        const fresh = model.railModel(
            library,
            getAllScopesForRole(ProjectMemberRole.VIEWER),
            new Map(),
        );
        expect(fresh.nextUpId).toBe('f1');
        const finished = model.railModel(
            library,
            getAllScopesForRole(ProjectMemberRole.VIEWER),
            new Map([
                ['f1', rollup({ completed: true })],
                ['f2', rollup({ completed: true })],
            ]),
        );
        expect(finished.nextUpId).toBeNull();
        expect(model.railModel([], [], new Map()).nextUpId).toBeNull();
    });
});

describe('labels', () => {
    it('picks the CTA by done then progress', () => {
        expect(ctaLabel(false, 0)).toBe('Start module');
        expect(ctaLabel(false, 0.5)).toBe('Continue module');
        expect(ctaLabel(false, 0.8)).toBe('Continue module');
        expect(ctaLabel(true, 1)).toBe('Review module');
    });

    it('pluralises', () => {
        expect(plural(1, 'lesson')).toBe('1 lesson');
        expect(plural(3, 'module')).toBe('3 modules');
    });
});
