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
    getSharedMembers,
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
        const parentMap = getParentMap(departments);
        const listed = departments.flatMap(({ departmentUuid }) => {
            const related = new Set([
                departmentUuid,
                ...getAncestorUuids(departmentUuid, parentMap),
                ...getDescendantUuids(departmentUuid, departments),
            ]);
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
    it('puts everyone in the sets in exactly one region, for every department', () => {
        const drawn = departments.flatMap(({ departmentUuid }) => {
            const { venn } = computeDepartmentOverlaps(
                snapshot,
                departmentUuid,
            );
            return venn === null ? [] : [venn];
        });
        expect(drawn.length).toBeGreaterThan(3);
        drawn.forEach((venn) => {
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

describe('getSharedMembers', () => {
    it('returns the people counted, rolled up, in the department and every other one given', () => {
        const userUuids = (others: string[], departmentUuid = 'stores') =>
            getSharedMembers(snapshot, departmentUuid, others).map(
                (m) => m.userUuid,
            );
        expect(userUuids(['marketing'])).toEqual(['ann', 'gus']);
        expect(userUuids(['marketing', 'depots'])).toEqual([]);
        expect(userUuids(['finance'], 'ops')).toEqual(['bob']);
        expect(userUuids([])).toEqual(peopleIn('stores'));
    });
});
