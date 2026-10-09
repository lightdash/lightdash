import {
    getActivityWindows,
    getAncestorUuids,
    getDescendantUuids,
    getParentMap,
    OrganizationMemberRole,
    resolveDepartmentMembership,
    type Department,
    type ResolvedMemberRow,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildAdoptionSnapshot } from './departmentMetrics';
import {
    computeDepartmentOverlaps,
    getMembersInRegion,
} from './departmentOverlaps';

const department = (
    departmentUuid: string,
    parentDepartmentUuid: string | null,
    name: string,
): Department => ({
    departmentUuid,
    parentDepartmentUuid,
    name,
    headcount: null,
    headcountNote: null,
    targetActiveUsers: null,
    targetDate: null,
    owners: [],
    linkedGroups: [],
    explicitMemberUuids: [],
});

// ops ─┬─ stores ── north
//      └─ depots
// finance
// sales ── enterprise
// marketing
// legal
const departments = [
    department('ops', null, 'Operations'),
    department('stores', 'ops', 'Stores'),
    department('north', 'stores', 'North'),
    department('depots', 'ops', 'Depots'),
    department('finance', null, 'Finance'),
    department('sales', null, 'Sales'),
    department('enterprise', 'sales', 'Enterprise sales'),
    department('marketing', null, 'Marketing'),
    department('legal', null, 'Legal'),
];

const person = (
    userUuid: string,
    explicitDepartmentUuids: string[],
    groupDepartmentUuids: string[] = [],
): ResolvedMemberRow => ({
    userUuid,
    email: `${userUuid}@example.com`,
    firstName: userUuid,
    lastName: 'L',
    role: OrganizationMemberRole.VIEWER,
    explicitDepartmentUuids,
    groupLinks: groupDepartmentUuids.map((departmentUuid) => ({
        departmentUuid,
        groupUuid: `g-${departmentUuid}`,
        groupName: `${departmentUuid} group`,
    })),
    primaryDepartmentUuid: null,
});

const snapshot = buildAdoptionSnapshot({
    departments,
    membership: resolveDepartmentMembership(
        [
            person('ann', ['marketing'], ['stores']),
            person('bob', ['finance'], ['north']),
            person('cara', [], ['depots', 'stores']),
            person('dan', ['stores']),
            person('eve', [], ['marketing', 'finance', 'sales']),
            person('fay', [], ['ops', 'marketing']),
            person('gus', ['stores', 'marketing']),
            // A group for the whole branch and one for the sub-department: counted below only
            person('hal', [], ['sales', 'enterprise']),
        ],
        departments,
    ),
    // Active a day before the bounds' instant, so in the last 30 days
    lastActiveAt: new Map(
        ['ann', 'dan', 'eve'].map((userUuid) => [
            userUuid,
            new Date('2026-10-07T09:30:00Z'),
        ]),
    ),
    windows: getActivityWindows(new Date('2026-10-08T09:30:00Z')),
    weeklyActivity: [],
    weekStarts: [],
});

const peopleIn = (departmentUuid: string): string[] =>
    (snapshot.rolledMembers.get(departmentUuid) ?? []).map((m) => m.userUuid);

// Each set's own department and the departments above and below it
const relatedTo = (departmentUuid: string, tree: Department[]) =>
    new Set([
        departmentUuid,
        ...getAncestorUuids(departmentUuid, getParentMap(tree)),
        ...getDescendantUuids(departmentUuid, tree),
    ]);

describe('computeDepartmentOverlaps', () => {
    it('lists every department sharing people with this one, most people first, then by name', () => {
        expect(computeDepartmentOverlaps(snapshot, 'stores').overlaps).toEqual([
            {
                departmentUuid: 'marketing',
                name: 'Marketing',
                people: 2,
                active30d: 1,
            },
            {
                departmentUuid: 'depots',
                name: 'Depots',
                people: 1,
                active30d: 0,
            },
            {
                departmentUuid: 'finance',
                name: 'Finance',
                people: 1,
                active30d: 0,
            },
        ]);
        // Equal counts fall back to the name
        expect(
            computeDepartmentOverlaps(snapshot, 'sales').overlaps.map(
                (o) => o.name,
            ),
        ).toEqual(['Finance', 'Marketing']);
    });
    it('counts the people of sub-departments in the overlap, and never lists the departments above or below', () => {
        // stores, north and depots all hold ops' people, and are left out
        expect(computeDepartmentOverlaps(snapshot, 'ops').overlaps).toEqual([
            {
                departmentUuid: 'marketing',
                name: 'Marketing',
                people: 3,
                active30d: 1,
            },
            {
                departmentUuid: 'finance',
                name: 'Finance',
                people: 1,
                active30d: 0,
            },
        ]);
        // hal counts in sales through enterprise, and sales sits above enterprise
        expect(computeDepartmentOverlaps(snapshot, 'enterprise')).toEqual({
            overlaps: [],
            venn: null,
        });
    });
    it('never lists a department above or below the one asked about, for any department', () => {
        const listed = departments.flatMap(({ departmentUuid }) => {
            const related = relatedTo(departmentUuid, departments);
            return computeDepartmentOverlaps(snapshot, departmentUuid)
                .overlaps.filter((o) => related.has(o.departmentUuid))
                .map((o) => `${departmentUuid} lists ${o.departmentUuid}`);
        });
        expect(listed).toEqual([]);
    });
    it('draws the department and its two largest overlaps, with a region for every combination', () => {
        expect(computeDepartmentOverlaps(snapshot, 'stores').venn).toEqual({
            sets: [
                { departmentUuid: 'stores', name: 'Stores' },
                { departmentUuid: 'marketing', name: 'Marketing' },
                { departmentUuid: 'depots', name: 'Depots' },
            ],
            regions: [
                { sets: ['stores'], people: 2, active30d: 1 },
                { sets: ['marketing'], people: 2, active30d: 1 },
                { sets: ['depots'], people: 0, active30d: 0 },
                { sets: ['stores', 'marketing'], people: 2, active30d: 1 },
                { sets: ['stores', 'depots'], people: 1, active30d: 0 },
                { sets: ['marketing', 'depots'], people: 0, active30d: 0 },
                {
                    sets: ['stores', 'marketing', 'depots'],
                    people: 0,
                    active30d: 0,
                },
            ],
        });
    });
    it('draws two sets when there is one overlap', () => {
        expect(computeDepartmentOverlaps(snapshot, 'north').venn).toEqual({
            sets: [
                { departmentUuid: 'north', name: 'North' },
                { departmentUuid: 'finance', name: 'Finance' },
            ],
            regions: [
                { sets: ['north'], people: 0, active30d: 0 },
                { sets: ['finance'], people: 1, active30d: 1 },
                { sets: ['north', 'finance'], people: 1, active30d: 0 },
            ],
        });
    });
    it('draws sets that are not above or below each other, with everyone in them in exactly one region, for every department', () => {
        const drawn = departments.flatMap(({ departmentUuid }) => {
            const { venn } = computeDepartmentOverlaps(
                snapshot,
                departmentUuid,
            );
            return venn === null ? [] : [venn];
        });
        expect(drawn.length).toBeGreaterThan(3);
        drawn.forEach((venn) => {
            // No set sits above or below another
            const uuids = venn.sets.map((set) => set.departmentUuid);
            uuids.forEach((uuid) => {
                const related = relatedTo(uuid, departments);
                expect(
                    uuids.filter(
                        (other) => other !== uuid && related.has(other),
                    ),
                ).toEqual([]);
            });
            const union = new Set(
                venn.sets.flatMap((set) => peopleIn(set.departmentUuid)),
            );
            const sum = (field: 'people' | 'active30d') =>
                venn.regions.reduce(
                    (total, region) => total + region[field],
                    0,
                );
            expect(sum('people')).toBe(union.size);
            expect(sum('active30d')).toBe(
                [...union].filter((u) => snapshot.activeUserUuids.has(u))
                    .length,
            );
            expect(venn.regions).toHaveLength(2 ** venn.sets.length - 1);
        });
    });
    it('has no overlaps and no diagram for a department nobody counts in', () => {
        expect(computeDepartmentOverlaps(snapshot, 'legal')).toEqual({
            overlaps: [],
            venn: null,
        });
        // An empty department never shows up as an overlap either
        departments.forEach(({ departmentUuid }) =>
            expect(
                computeDepartmentOverlaps(
                    snapshot,
                    departmentUuid,
                ).overlaps.map((o) => o.departmentUuid),
            ).not.toContain('legal'),
        );
    });
});

describe('the diagram sets', () => {
    // ops ── stores
    // finance
    // marketing
    // legal
    const tree = [
        department('ops', null, 'Operations'),
        department('stores', 'ops', 'Stores'),
        department('finance', null, 'Finance'),
        department('marketing', null, 'Marketing'),
        department('legal', null, 'Legal'),
    ];
    const nested = buildAdoptionSnapshot({
        departments: tree,
        membership: resolveDepartmentMembership(
            [
                person('p1', ['marketing'], ['stores']),
                person('p2', ['marketing', 'stores']),
                person('p3', ['marketing'], ['ops']),
                person('p4', ['marketing', 'finance']),
                person('p5', ['legal'], ['stores']),
            ],
            tree,
        ),
        // Active a day before the bounds' instant, so in the last 30 days
        lastActiveAt: new Map([['p1', new Date('2026-10-07T09:30:00Z')]]),
        windows: getActivityWindows(new Date('2026-10-08T09:30:00Z')),
        weeklyActivity: [],
        weekStarts: [],
    });

    it('takes the largest overlap, then the largest one neither above nor below it', () => {
        const { overlaps, venn } = computeDepartmentOverlaps(
            nested,
            'marketing',
        );
        // The two largest overlaps are a parent and its child
        expect(overlaps.map((o) => [o.name, o.people])).toEqual([
            ['Operations', 3],
            ['Stores', 2],
            ['Finance', 1],
        ]);
        expect(venn).toEqual({
            sets: [
                { departmentUuid: 'marketing', name: 'Marketing' },
                { departmentUuid: 'ops', name: 'Operations' },
                { departmentUuid: 'finance', name: 'Finance' },
            ],
            regions: [
                { sets: ['marketing'], people: 0, active30d: 0 },
                { sets: ['ops'], people: 1, active30d: 0 },
                { sets: ['finance'], people: 0, active30d: 0 },
                { sets: ['marketing', 'ops'], people: 3, active30d: 1 },
                { sets: ['marketing', 'finance'], people: 1, active30d: 0 },
                { sets: ['ops', 'finance'], people: 0, active30d: 0 },
                {
                    sets: ['marketing', 'ops', 'finance'],
                    people: 0,
                    active30d: 0,
                },
            ],
        });
    });
    it('draws two sets when every other overlap is above or below the largest', () => {
        const { overlaps, venn } = computeDepartmentOverlaps(nested, 'legal');
        expect(overlaps.map((o) => o.name)).toEqual(['Operations', 'Stores']);
        expect(venn?.sets.map((set) => set.name)).toEqual([
            'Legal',
            'Operations',
        ]);
        expect(venn?.regions).toHaveLength(3);
    });
});

describe('getMembersInRegion', () => {
    const userUuids = (
        withUuids: string[],
        withoutUuids: string[] = [],
        departmentUuid = 'stores',
    ) =>
        getMembersInRegion(
            snapshot,
            departmentUuid,
            withUuids,
            withoutUuids,
        ).map((m) => m.userUuid);

    it('returns the people in the department and in every department of with, rolled up', () => {
        expect(userUuids(['marketing'])).toEqual(['ann', 'gus']);
        expect(userUuids(['marketing', 'depots'])).toEqual([]);
        expect(userUuids(['finance'], [], 'ops')).toEqual(['bob']);
    });
    it('leaves out the people in any department of without', () => {
        // Stores only, against Marketing and Depots
        expect(userUuids([], ['marketing', 'depots'])).toEqual(['dan', 'bob']);
        // Stores and Depots, not Marketing
        expect(userUuids(['depots'], ['marketing'])).toEqual(['cara']);
    });
    it('lists exactly the people of each region that holds the department, for every department', () => {
        const checked = departments.flatMap(({ departmentUuid }) => {
            const { venn } = computeDepartmentOverlaps(
                snapshot,
                departmentUuid,
            );
            if (venn === null) return [];
            const others = venn.sets
                .map((set) => set.departmentUuid)
                .filter((uuid) => uuid !== departmentUuid);
            return venn.regions
                .filter((region) => region.sets.includes(departmentUuid))
                .map((region) => ({
                    people: region.people,
                    listed: getMembersInRegion(
                        snapshot,
                        departmentUuid,
                        others.filter((uuid) => region.sets.includes(uuid)),
                        others.filter((uuid) => !region.sets.includes(uuid)),
                    ).length,
                }));
        });
        expect(checked.length).toBeGreaterThan(10);
        checked.forEach(({ people, listed }) => expect(listed).toBe(people));
    });
});
