import {
    getActivityWindows,
    OrganizationMemberRole,
    type AdoptionMetrics,
    type DepartmentMembership,
    type DepartmentWithMetrics,
    type MembershipPlacement,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildDepartmentMembers,
    computeTargetProgress,
    computeWeeklyWithOrgAverage,
} from './departmentDetail';

const NOW = new Date('2026-10-07T12:00:00Z');

const metrics = (weekly: number[]): AdoptionMetrics => ({
    memberCount: 0,
    activeCount30d: 0,
    activeCount12w: 0,
    sharedCount: 0,
    coveragePct: null,
    activePct: null,
    roleSplit: { viewers: 0, interactiveViewers: 0, editors: 0, admins: 0 },
    activitySplit: { healthy: 0, atRisk: 0, lost: 0 },
    weeklyActive: weekly.map((activeUsers, i) => ({
        weekStart: `2026-09-${String(7 * (i + 1)).padStart(2, '0')}`,
        activeUsers,
    })),
});

const department = (
    departmentUuid: string,
    parentDepartmentUuid: string | null,
    weekly: number[],
): DepartmentWithMetrics => ({
    departmentUuid,
    parentDepartmentUuid,
    name: departmentUuid,
    headcount: null,
    headcountNote: null,
    targetActiveUsers: null,
    targetDate: null,
    owners: [],
    linkedGroups: [],
    explicitMemberUuids: [],
    // Nobody on Lightdash and no headcount
    effectiveHeadcount: 0,
    hasHeadcount: false,
    headcountBelowChildren: false,
    metrics: metrics(weekly),
    directMetrics: metrics(weekly),
});

const viaGroup = (departmentUuid: string): MembershipPlacement => ({
    departmentUuid,
    source: 'group',
    sourceGroupName: 'Store staff',
});

const explicit = (departmentUuid: string): MembershipPlacement => ({
    departmentUuid,
    source: 'explicit',
    sourceGroupName: null,
});

// Placements in uuid order, as resolved; counted in all of them, or in the primary alone
const member = (
    userUuid: string,
    placements: MembershipPlacement[],
    primaryDepartmentUuid: string | null = null,
): DepartmentMembership => ({
    userUuid,
    email: `${userUuid}@example.com`,
    firstName: userUuid,
    lastName: 'L',
    role: OrganizationMemberRole.VIEWER,
    kind: placements.length > 1 ? 'shared' : 'assigned',
    placements,
    primaryDepartmentUuid,
    countedDepartmentUuids:
        primaryDepartmentUuid === null
            ? placements.map((p) => p.departmentUuid)
            : [primaryDepartmentUuid],
});

describe('computeTargetProgress', () => {
    const progress = (targetDate: string | null, activeUsers = 4) =>
        computeTargetProgress(
            { targetActiveUsers: 10, targetDate },
            activeUsers,
            NOW,
        );
    it('is null without a target', () => {
        expect(
            computeTargetProgress(
                { targetActiveUsers: null, targetDate: '2026-12-31' },
                5,
                NOW,
            ),
        ).toBeNull();
    });
    it('reports what is left and weeks to the date', () => {
        expect(
            computeTargetProgress(
                { targetActiveUsers: 40, targetDate: '2026-10-28' },
                25,
                NOW,
            ),
        ).toEqual({
            targetActiveUsers: 40,
            targetDate: '2026-10-28',
            activeUsers: 25,
            remaining: 15,
            weeksLeft: 3,
        });
    });
    it('rounds a partial week up', () => {
        expect(progress('2026-10-08')?.weeksLeft).toBe(1);
        expect(progress('2026-10-14')?.weeksLeft).toBe(1);
        expect(progress('2026-10-15')?.weeksLeft).toBe(2);
    });
    it('is 0 on the target day', () => {
        expect(progress('2026-10-07')?.weeksLeft).toBe(0);
    });
    it('goes negative once the date has passed, rounding the same way', () => {
        expect(progress('2026-10-06')?.weeksLeft).toBe(-1);
        expect(progress('2026-09-30')?.weeksLeft).toBe(-1);
        expect(progress('2026-09-29')?.weeksLeft).toBe(-2);
        expect(progress('2026-09-01')?.weeksLeft).toBe(-6);
    });
    it('uses the UTC day, not the time of day', () => {
        const lateEvening = new Date('2026-10-07T23:59:00Z');
        expect(
            computeTargetProgress(
                { targetActiveUsers: 10, targetDate: '2026-10-08' },
                0,
                lateEvening,
            )?.weeksLeft,
        ).toBe(1);
    });
    it('never reports a negative remaining when the target is beaten', () => {
        expect(progress('2026-12-31', 14)?.remaining).toBe(0);
    });
    it('has no weeks left figure without a date', () => {
        expect(progress(null)?.weeksLeft).toBeNull();
    });
});

describe('computeWeeklyWithOrgAverage', () => {
    const all = [
        department('ops', null, [4, 8]),
        department('finance', null, [2, 1]),
        department('stores', 'ops', [3, 5]),
        department('depots', 'ops', [0, 2]),
    ];
    it('averages across departments at the same level only', () => {
        expect(computeWeeklyWithOrgAverage(all[0], all)).toEqual([
            { weekStart: '2026-09-07', activeUsers: 4, orgAverage: 3 },
            { weekStart: '2026-09-14', activeUsers: 8, orgAverage: 4.5 },
        ]);
        expect(
            computeWeeklyWithOrgAverage(all[2], all).map((p) => p.orgAverage),
        ).toEqual([1.5, 3.5]);
    });
    it('handles a 5,000-deep chain and a 5,000-wide level without overflowing the stack', () => {
        const SIZE = 5000;
        const chain = Array.from({ length: SIZE }, (_, i) =>
            department(`d${i}`, i === 0 ? null : `d${i - 1}`, [i, 1]),
        );
        // Alone at its depth, so the average is its own figure
        expect(
            computeWeeklyWithOrgAverage(chain[SIZE - 1], chain).map(
                (p) => p.orgAverage,
            ),
        ).toEqual([SIZE - 1, 1]);
        const wide = [
            department('root', null, [0, 0]),
            ...Array.from({ length: SIZE }, (_, i) =>
                department(`c${i}`, 'root', [i % 2, 2]),
            ),
        ];
        expect(
            computeWeeklyWithOrgAverage(wide[1], wide).map((p) => p.orgAverage),
        ).toEqual([0.5, 2]);
    });
});

describe('buildDepartmentMembers', () => {
    // ops ─┬─ stores
    //      └─ depots
    // finance
    const departments = [
        {
            departmentUuid: 'ops',
            parentDepartmentUuid: null,
            name: 'Operations',
        },
        {
            departmentUuid: 'stores',
            parentDepartmentUuid: 'ops',
            name: 'Stores',
        },
        {
            departmentUuid: 'depots',
            parentDepartmentUuid: 'ops',
            name: 'Depots',
        },
        {
            departmentUuid: 'finance',
            parentDepartmentUuid: null,
            name: 'Finance',
        },
    ];
    const built = buildDepartmentMembers({
        departmentUuid: 'ops',
        members: [
            member('recent', [explicit('ops')]),
            member('never', [viaGroup('stores')]),
            member('stale', [viaGroup('stores')]),
            member('lapsed', [viaGroup('stores')]),
        ],
        departments,
        activity: [
            {
                userUuid: 'recent',
                lastActiveAt: new Date('2026-10-06T00:00:00Z'),
                isActive30d: true,
                queries30d: 9,
                dashboardViews30d: 3,
            },
            {
                userUuid: 'stale',
                lastActiveAt: new Date('2026-06-01T00:00:00Z'),
                isActive30d: false,
                queries30d: 0,
                dashboardViews30d: 0,
            },
            {
                userUuid: 'lapsed',
                lastActiveAt: new Date('2026-08-20T00:00:00Z'),
                isActive30d: false,
                queries30d: 0,
                dashboardViews30d: 0,
            },
        ],
        windows: getActivityWindows(NOW),
    });
    const buildFor = (
        departmentUuid: string,
        members: DepartmentMembership[],
    ) =>
        buildDepartmentMembers({
            departmentUuid,
            members,
            departments,
            activity: [],
            windows: getActivityWindows(NOW),
        });

    it('sorts no recorded activity first, then longest inactive', () => {
        expect(built.map((m) => m.userUuid)).toEqual([
            'never',
            'stale',
            'lapsed',
            'recent',
        ]);
    });
    it('places each person in the activity bucket the counts use, from the same bounds', () => {
        expect(
            Object.fromEntries(built.map((m) => [m.userUuid, m.activity])),
        ).toEqual({
            never: 'lost',
            // More than 90 days before now
            stale: 'lost',
            lapsed: 'atRisk',
            recent: 'healthy',
        });
    });
    it('labels where each person resolved and how', () => {
        expect(built[0]).toMatchObject({
            departmentName: 'Stores',
            isDirect: false,
            source: 'group',
            sourceGroupName: 'Store staff',
            lastActiveAt: null,
            isActive30d: false,
            queries30d: 0,
            dashboardViews30d: 0,
            sharedWith: [],
            primaryDepartmentUuid: null,
        });
        expect(built[3]).toMatchObject({
            departmentName: 'Operations',
            isDirect: true,
            source: 'explicit',
            sourceGroupName: null,
            lastActiveAt: '2026-10-06T00:00:00.000Z',
            isActive30d: true,
            queries30d: 9,
        });
    });
    it("lists a person's other departments as also in", () => {
        const [person] = buildFor('ops', [
            member('both', [explicit('finance'), viaGroup('stores')]),
        ]);
        expect(person).toMatchObject({
            departmentUuid: 'stores',
            departmentName: 'Stores',
            isDirect: false,
            source: 'group',
            sharedWith: [{ departmentUuid: 'finance', name: 'Finance' }],
            primaryDepartmentUuid: null,
        });
    });
    it('names one sub-department for a person counted in two of them, and the other as also in', () => {
        const split = member('split', [viaGroup('depots'), viaGroup('stores')]);
        expect(buildFor('ops', [split])[0]).toMatchObject({
            departmentUuid: 'depots',
            isDirect: false,
            sharedWith: [{ departmentUuid: 'stores', name: 'Stores' }],
        });
        expect(buildFor('stores', [split])[0]).toMatchObject({
            departmentUuid: 'stores',
            isDirect: true,
            sharedWith: [{ departmentUuid: 'depots', name: 'Depots' }],
        });
    });
    it('shows where a person with a primary counts, the rest as also in, and the primary', () => {
        const [person] = buildFor('finance', [
            member(
                'chosen',
                [explicit('finance'), viaGroup('stores')],
                'finance',
            ),
        ]);
        expect(person).toMatchObject({
            departmentUuid: 'finance',
            departmentName: 'Finance',
            isDirect: true,
            source: 'explicit',
            sourceGroupName: null,
            sharedWith: [{ departmentUuid: 'stores', name: 'Stores' }],
            primaryDepartmentUuid: 'finance',
        });
    });
    it('leaves out a person who does not count under the department', () => {
        expect(
            buildFor('ops', [
                member(
                    'elsewhere',
                    [explicit('finance'), viaGroup('stores')],
                    'finance',
                ),
            ]),
        ).toEqual([]);
    });
});
