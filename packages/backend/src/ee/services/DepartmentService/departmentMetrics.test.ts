import {
    getActivityWindows,
    OrganizationMemberRole,
    type Department,
    type DepartmentMembership,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import Logger from '../../../logging/logger';
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
const NOW = new Date('2026-10-08T09:30:00Z');
const WINDOWS = getActivityWindows(NOW);
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);
// Each person's latest activity as getActivity reads it, a day ago, so in the last 30 days
const activeYesterday = (userUuids: string[]) =>
    new Map(userUuids.map((userUuid) => [userUuid, daysAgo(1)]));

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
    it('counts a role it does not know as a viewer and warns once, instead of failing', () => {
        const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
        // A role a later migration might add to organization_membership_roles
        const unknownRole = 'auditor' as OrganizationMemberRole;
        const metrics = () =>
            computeAdoptionMetrics({
                members: [
                    member('a', unknownRole),
                    member('b', unknownRole),
                    member('c', OrganizationMemberRole.ADMIN),
                ],
                headcount: null,
                lastActiveAt: new Map(),
                windows: WINDOWS,
                weeksByUser: new Map(),
                weekStarts,
            });
        expect(metrics().roleSplit).toEqual({
            viewers: 2,
            interactiveViewers: 0,
            editors: 0,
            admins: 1,
        });
        metrics();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('"auditor"');
        warn.mockRestore();
    });
    it('splits the people on Lightdash into healthy, at risk and lost at the bucket bounds, healthy being the 30-day count', () => {
        const m = computeAdoptionMetrics({
            members: ['day30', 'day31', 'day90', 'day91', 'never'].map((u) =>
                member(u, OrganizationMemberRole.VIEWER),
            ),
            headcount: 8,
            lastActiveAt: new Map([
                ['day30', daysAgo(30)],
                ['day31', daysAgo(31)],
                ['day90', daysAgo(90)],
                ['day91', daysAgo(91)],
            ]),
            windows: WINDOWS,
            weeksByUser: new Map(),
            weekStarts,
        });
        expect(m.activitySplit).toEqual({ healthy: 1, atRisk: 2, lost: 2 });
        expect(m.activeCount30d).toBe(1);
    });
    it('computes coverage and active as percentages of headcount', () => {
        const m = computeAdoptionMetrics({
            members: [
                member('a', OrganizationMemberRole.VIEWER),
                member('b', OrganizationMemberRole.EDITOR),
            ],
            headcount: 4,
            lastActiveAt: activeYesterday(['a']),
            windows: WINDOWS,
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
            lastActiveAt: new Map(),
            windows: WINDOWS,
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
            lastActiveAt: activeYesterday(['a']),
            windows: WINDOWS,
            weeksByUser: new Map(),
            weekStarts,
        });
        expect(m.coveragePct).toBeNull();
        expect(m.activePct).toBeNull();
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
            lastActiveAt: new Map(),
            windows: WINDOWS,
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
            lastActiveAt: activeYesterday(['a', 'zz']),
            windows: WINDOWS,
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
            lastActiveAt: activeYesterday(['a']),
            windows: WINDOWS,
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
        lastActiveAt: activeYesterday(['s1', 'o1']),
        windows: WINDOWS,
        weeklyActivity: [{ userUuid: 's1', weekStart: '2026-10-05' }],
        weekStarts,
    });
    const byUuid = new Map(
        snapshot.summary.departments.map((d) => [d.departmentUuid, d]),
    );

    it('rolls the activity split up once per person, and counts everyone on Lightdash once across the organization', () => {
        const split = buildAdoptionSnapshot({
            departments,
            membership,
            lastActiveAt: new Map([
                ['s1', daysAgo(1)],
                ['s2', daysAgo(45)],
                ['o1', daysAgo(45)],
                ['clash', daysAgo(60)],
            ]),
            windows: WINDOWS,
            weeklyActivity: [],
            weekStarts,
        });
        const of = (uuid: string) =>
            split.summary.departments.find((d) => d.departmentUuid === uuid);
        expect(of('stores')?.metrics.activitySplit).toEqual({
            healthy: 1,
            atRisk: 1,
            lost: 0,
        });
        // Stores' two people and the one directly in Ops, each counted once
        expect(of('ops')?.metrics.activitySplit).toEqual({
            healthy: 1,
            atRisk: 2,
            lost: 0,
        });
        expect(of('ops')?.directMetrics.activitySplit).toEqual({
            healthy: 0,
            atRisk: 1,
            lost: 0,
        });
        // A person in a conflict is placed in neither department until it is settled
        expect(of('depots')?.metrics.activitySplit).toEqual({
            healthy: 0,
            atRisk: 0,
            lost: 0,
        });
        expect(of('finance')?.metrics.activitySplit).toEqual({
            healthy: 0,
            atRisk: 0,
            lost: 0,
        });
        // Everyone on Lightdash, placed or not: the unplaced person has no activity at all
        expect(split.summary.organization.activitySplit).toEqual({
            healthy: 1,
            atRisk: 3,
            lost: 1,
        });
    });
    it('rolls members and headcount up to the parent, with its own people on top of its sub-departments', () => {
        const ops = byUuid.get('ops');
        // Stores 10 and Depots 30, and the 1 person directly in Ops
        expect(ops?.effectiveHeadcount).toBe(41);
        expect(ops?.hasHeadcount).toBe(true);
        expect(ops?.headcountBelowChildren).toBe(false);
        expect(ops?.metrics.memberCount).toBe(3);
        expect(ops?.metrics.activeCount30d).toBe(2);
        expect(ops?.metrics.coveragePct).toBe(7);
        expect(ops?.directMetrics.memberCount).toBe(1);
    });
    it("gives a department's own people percentages of the headcount it keeps for them", () => {
        const ops = byUuid.get('ops');
        expect(ops?.directMetrics.activeCount30d).toBe(1);
        // Ops keeps 1 beside its sub-departments' 40, for its 1 person
        expect(ops?.directMetrics.coveragePct).toBe(100);
        expect(ops?.directMetrics.activePct).toBe(100);
        // Without sub-departments it keeps its whole headcount
        expect(byUuid.get('stores')?.directMetrics).toMatchObject({
            memberCount: 2,
            coveragePct: 20,
            activePct: 10,
        });
    });
    it('keeps what a parent headcount leaves over its sub-departments for the people directly in it', () => {
        const parent = buildAdoptionSnapshot({
            departments: [
                department('parent', null, 50),
                department('a', 'parent', 20),
                department('b', 'parent', 10),
            ],
            membership: [
                member('p1', OrganizationMemberRole.VIEWER, 'parent'),
                member('p2', OrganizationMemberRole.VIEWER, 'parent'),
                member('a1', OrganizationMemberRole.VIEWER, 'a'),
            ],
            lastActiveAt: activeYesterday(['p1']),
            windows: WINDOWS,
            weeklyActivity: [],
            weekStarts,
        }).summary.departments.find((d) => d.departmentUuid === 'parent');
        expect(parent?.effectiveHeadcount).toBe(50);
        // 50 less 30 leaves 20 for its 2 people, 1 of them active
        expect(parent?.directMetrics).toMatchObject({
            memberCount: 2,
            coveragePct: 10,
            activePct: 5,
        });
    });
    it('gives no percentages to the people directly in a department that keeps no headcount for them', () => {
        const parent = buildAdoptionSnapshot({
            departments: [
                department('parent', null, 30),
                department('a', 'parent', 20),
                department('b', 'parent', 10),
            ],
            membership: [member('a1', OrganizationMemberRole.VIEWER, 'a')],
            lastActiveAt: new Map(),
            windows: WINDOWS,
            weeklyActivity: [],
            weekStarts,
        }).summary.departments.find((d) => d.departmentUuid === 'parent');
        expect(parent?.directMetrics).toMatchObject({
            memberCount: 0,
            coveragePct: null,
            activePct: null,
        });
    });
    it('never puts the headcount below the people on Lightdash, so coverage and activity never pass 100%', () => {
        // Three people on Lightdash, all active, in a department whose headcount says two
        const stale = buildAdoptionSnapshot({
            departments: [department('stale', null, 2)],
            membership: ['a', 'b', 'c'].map((uuid) =>
                member(uuid, OrganizationMemberRole.VIEWER, 'stale'),
            ),
            lastActiveAt: activeYesterday(['a', 'b', 'c']),
            windows: WINDOWS,
            weeklyActivity: [],
            weekStarts,
        });
        const [only] = stale.summary.departments;
        expect(only.headcount).toBe(2);
        expect(only.effectiveHeadcount).toBe(3);
        expect(only.hasHeadcount).toBe(true);
        expect(only.metrics.coveragePct).toBe(100);
        expect(only.metrics.activePct).toBe(100);
    });
    it('counts a parent headcount below its sub-departments as their total, and flags it', () => {
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
            lastActiveAt: new Map(),
            windows: WINDOWS,
            weeklyActivity: [],
            weekStarts,
        });
        const parent = low.summary.departments.find(
            (d) => d.departmentUuid === 'parent',
        );
        expect(parent?.headcount).toBe(5);
        expect(parent?.effectiveHeadcount).toBe(20);
        expect(parent?.headcountBelowChildren).toBe(true);
        expect(parent?.metrics.coveragePct).toBe(10);
    });
    it('counts its people on Lightdash as the headcount of a department with none anywhere in its subtree', () => {
        const none = buildAdoptionSnapshot({
            departments: [
                department('x', null, null),
                department('y', 'x', null),
            ],
            membership: [
                member('x1', OrganizationMemberRole.VIEWER, 'x'),
                member('y1', OrganizationMemberRole.VIEWER, 'y'),
            ],
            lastActiveAt: activeYesterday(['x1']),
            windows: WINDOWS,
            weeklyActivity: [],
            weekStarts,
        });
        const [x, y] = none.summary.departments;
        expect(x.effectiveHeadcount).toBe(2);
        expect(x.hasHeadcount).toBe(false);
        expect(x.metrics.coveragePct).toBe(100);
        expect(x.metrics.activePct).toBe(50);
        expect(y.effectiveHeadcount).toBe(1);
        expect(y.hasHeadcount).toBe(false);
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
