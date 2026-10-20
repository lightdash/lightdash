import {
    OrganizationMemberRole,
    type Department,
    type DepartmentMembership,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildAdoptionSnapshot,
    computeAdoptionMetrics,
    indexWeeklyActivity,
    lastNWeekStarts,
} from './departmentMetrics';

const member = (
    userUuid: string,
    role: OrganizationMemberRole,
    departmentUuid: string | null = 'd',
): DepartmentMembership => ({
    userUuid,
    email: `${userUuid}@example.com`,
    firstName: userUuid,
    lastName: 'L',
    role,
    resolution:
        departmentUuid === null
            ? { kind: 'unassigned' }
            : {
                  kind: 'assigned',
                  departmentUuid,
                  source: 'group',
                  sourceGroupName: 'g',
              },
});

const department = (
    departmentUuid: string,
    parentDepartmentUuid: string | null,
    headcount: number | null,
): Department => ({
    departmentUuid,
    parentDepartmentUuid,
    name: departmentUuid,
    headcount,
    headcountNote: null,
    targetActiveUsers: null,
    targetDate: null,
    owners: [],
    linkedGroups: [],
    explicitMemberUuids: [],
});

const weekStarts = ['2026-09-28', '2026-10-05'];

describe('lastNWeekStarts', () => {
    it('returns n Mondays oldest first ending with the current week', () => {
        // 2026-10-07 is a Wednesday
        expect(lastNWeekStarts(3, new Date('2026-10-07T12:00:00Z'))).toEqual([
            '2026-09-21',
            '2026-09-28',
            '2026-10-05',
        ]);
    });
    it('treats Sunday as the end of the week, not the start', () => {
        expect(lastNWeekStarts(1, new Date('2026-10-11T23:00:00Z'))).toEqual([
            '2026-10-05',
        ]);
    });
});

describe('computeAdoptionMetrics', () => {
    it('computes coverage and active as percentages of headcount', () => {
        const m = computeAdoptionMetrics({
            members: [
                member('a', OrganizationMemberRole.VIEWER),
                member('b', OrganizationMemberRole.EDITOR),
            ],
            headcount: 4,
            activeUserUuids: new Set(['a']),
            weeksByUser: indexWeeklyActivity([
                { userUuid: 'a', weekStart: '2026-10-05' },
            ]),
            weekStarts,
        });
        expect(m.memberCount).toBe(2);
        expect(m.activeCount30d).toBe(1);
        expect(m.activeCount12w).toBe(1);
        expect(m.coveragePct).toBe(50);
        expect(m.activePct).toBe(25);
        expect(m.weeklyActive).toEqual([
            { weekStart: '2026-09-28', activeUsers: 0 },
            { weekStart: '2026-10-05', activeUsers: 1 },
        ]);
    });
    it('null headcount gives null percentages', () => {
        const m = computeAdoptionMetrics({
            members: [member('a', OrganizationMemberRole.VIEWER)],
            headcount: null,
            activeUserUuids: new Set(),
            weeksByUser: new Map(),
            weekStarts,
        });
        expect(m.coveragePct).toBeNull();
        expect(m.activePct).toBeNull();
    });
    it('zero headcount gives null percentages, not Infinity', () => {
        const m = computeAdoptionMetrics({
            members: [member('a', OrganizationMemberRole.VIEWER)],
            headcount: 0,
            activeUserUuids: new Set(['a']),
            weeksByUser: new Map(),
            weekStarts,
        });
        expect(m.coveragePct).toBeNull();
        expect(m.activePct).toBeNull();
    });
    it('reports coverage above 100 when accounts outnumber a stale headcount', () => {
        const m = computeAdoptionMetrics({
            members: [
                member('a', OrganizationMemberRole.VIEWER),
                member('b', OrganizationMemberRole.VIEWER),
                member('c', OrganizationMemberRole.VIEWER),
            ],
            headcount: 2,
            activeUserUuids: new Set(),
            weeksByUser: new Map(),
            weekStarts,
        });
        expect(m.coveragePct).toBe(150);
    });
    it('buckets roles: member and viewer are viewers, editor and developer are editors', () => {
        const m = computeAdoptionMetrics({
            members: [
                member('a', OrganizationMemberRole.MEMBER),
                member('b', OrganizationMemberRole.VIEWER),
                member('c', OrganizationMemberRole.INTERACTIVE_VIEWER),
                member('d', OrganizationMemberRole.EDITOR),
                member('e', OrganizationMemberRole.DEVELOPER),
                member('f', OrganizationMemberRole.ADMIN),
            ],
            headcount: null,
            activeUserUuids: new Set(),
            weeksByUser: new Map(),
            weekStarts,
        });
        expect(m.roleSplit).toEqual({
            viewers: 2,
            interactiveViewers: 1,
            editors: 2,
            admins: 1,
        });
    });
    it('ignores activity from users outside the member set', () => {
        const m = computeAdoptionMetrics({
            members: [member('a', OrganizationMemberRole.VIEWER)],
            headcount: 1,
            activeUserUuids: new Set(['a', 'zz']),
            weeksByUser: indexWeeklyActivity([
                { userUuid: 'zz', weekStart: '2026-10-05' },
            ]),
            weekStarts,
        });
        expect(m.activeCount30d).toBe(1);
        expect(m.weeklyActive[1].activeUsers).toBe(0);
    });
    it('never reports fewer 12-week actives than 30-day actives', () => {
        const m = computeAdoptionMetrics({
            members: [member('a', OrganizationMemberRole.VIEWER)],
            headcount: 1,
            activeUserUuids: new Set(['a']),
            weeksByUser: new Map(),
            weekStarts,
        });
        expect(m.activeCount12w).toBe(1);
    });
});

describe('buildAdoptionSnapshot', () => {
    const departments = [
        department('ops', null, null),
        department('stores', 'ops', 10),
        department('depots', 'ops', 30),
        department('finance', null, 5),
    ];
    const membership = [
        member('s1', OrganizationMemberRole.VIEWER, 'stores'),
        member('s2', OrganizationMemberRole.MEMBER, 'stores'),
        member('o1', OrganizationMemberRole.ADMIN, 'ops'),
        member('nobody', OrganizationMemberRole.VIEWER, null),
        {
            ...member('clash', OrganizationMemberRole.VIEWER),
            resolution: {
                kind: 'conflict' as const,
                departmentUuids: ['depots', 'finance'],
            },
        },
    ];
    const snapshot = buildAdoptionSnapshot({
        departments,
        membership,
        activeUserUuids: new Set(['s1', 'o1']),
        weeklyActivity: [{ userUuid: 's1', weekStart: '2026-10-05' }],
        weekStarts,
    });
    const byUuid = new Map(
        snapshot.summary.departments.map((d) => [d.departmentUuid, d]),
    );

    it('rolls members and headcount up to the parent', () => {
        const ops = byUuid.get('ops');
        expect(ops?.effectiveHeadcount).toBe(40);
        expect(ops?.headcountBelowChildren).toBe(false);
        expect(ops?.metrics.memberCount).toBe(3);
        expect(ops?.metrics.activeCount30d).toBe(2);
        expect(ops?.metrics.coveragePct).toBe(8);
        expect(ops?.directMetrics.memberCount).toBe(1);
    });
    it('keeps a parent headcount that is below its children as the denominator', () => {
        const low = buildAdoptionSnapshot({
            departments: [
                department('parent', null, 5),
                department('a', 'parent', 10),
                department('b', 'parent', 10),
            ],
            membership: [
                member('p1', OrganizationMemberRole.VIEWER, 'a'),
                member('p2', OrganizationMemberRole.VIEWER, 'b'),
            ],
            activeUserUuids: new Set(),
            weeklyActivity: [],
            weekStarts,
        });
        const parent = low.summary.departments.find(
            (d) => d.departmentUuid === 'parent',
        );
        expect(parent?.effectiveHeadcount).toBe(5);
        expect(parent?.headcountBelowChildren).toBe(true);
        expect(parent?.metrics.coveragePct).toBe(40);
    });
    it('gives null percentages for a department with no headcount anywhere in its subtree', () => {
        const none = buildAdoptionSnapshot({
            departments: [department('x', null, null)],
            membership: [member('x1', OrganizationMemberRole.VIEWER, 'x')],
            activeUserUuids: new Set(['x1']),
            weeklyActivity: [],
            weekStarts,
        });
        const x = none.summary.departments[0];
        expect(x.effectiveHeadcount).toBeNull();
        expect(x.metrics.coveragePct).toBeNull();
        expect(x.metrics.activePct).toBeNull();
    });
    it('keeps a department with no users at zero, not missing', () => {
        const depots = byUuid.get('depots');
        expect(depots?.metrics.memberCount).toBe(0);
        expect(depots?.metrics.coveragePct).toBe(0);
    });
    it('counts custom-role members (role member) as viewers', () => {
        expect(byUuid.get('stores')?.metrics.roleSplit.viewers).toBe(2);
    });
    it('counts conflicted and unassigned users in attention and in the org total only', () => {
        expect(snapshot.summary.attention).toEqual({
            conflictCount: 1,
            unassignedCount: 1,
        });
        expect(snapshot.summary.organization.memberCount).toBe(5);
        expect(byUuid.get('finance')?.metrics.memberCount).toBe(0);
    });
    it('exposes direct and rolled member lists for later reads', () => {
        expect(
            snapshot.rolledMembers
                .get('ops')
                ?.map((m) => m.userUuid)
                .sort(),
        ).toEqual(['o1', 's1', 's2']);
        expect(
            snapshot.directMembers.get('ops')?.map((m) => m.userUuid),
        ).toEqual(['o1']);
    });
});
