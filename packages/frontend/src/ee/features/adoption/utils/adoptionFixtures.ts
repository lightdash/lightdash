import {
    computeEffectiveHeadcounts,
    OrganizationMemberRole,
    type AdoptionMetrics,
    type DepartmentMember,
    type DepartmentWithMetrics,
} from '@lightdash/common';

// Test data builders shared by the adoption tests
export const metricsFixture = (
    memberCount: number,
    coveragePct: number | null,
    over: Partial<AdoptionMetrics> = {},
): AdoptionMetrics => ({
    memberCount,
    activeCount30d: 0,
    activeCount12w: 0,
    coveragePct,
    activePct: coveragePct === null ? null : 0,
    roleSplit: {
        viewers: memberCount,
        interactiveViewers: 0,
        editors: 0,
        admins: 0,
    },
    weeklyActive: Array.from({ length: 12 }, (_, i) => ({
        weekStart: new Date(Date.UTC(2026, 0, 5 + 7 * i))
            .toISOString()
            .slice(0, 10),
        activeUsers: 0,
    })),
    ...over,
});

export const dept = (
    name: string,
    parentDepartmentUuid: string | null,
    coveragePct: number | null,
    over: Partial<DepartmentWithMetrics> = {},
): DepartmentWithMetrics => {
    const headcount =
        over.headcount !== undefined
            ? over.headcount
            : coveragePct === null
              ? null
              : 10;
    // Members follow the requested coverage; the shown coverage is derived from them
    const memberCount =
        headcount === null
            ? 1
            : Math.round(((coveragePct ?? 0) * headcount) / 100);
    const metrics = metricsFixture(
        memberCount,
        headcount === null ? null : Math.round((100 * memberCount) / headcount),
    );
    return {
        departmentUuid: name,
        parentDepartmentUuid,
        name,
        headcount,
        headcountNote: null,
        targetActiveUsers: null,
        targetDate: null,
        owners: [],
        linkedGroups: [],
        explicitMemberUuids: [],
        // Never below the people on Lightdash, as the server gives it
        effectiveHeadcount: Math.max(headcount ?? 0, memberCount),
        hasHeadcount: headcount !== null,
        headcountBelowChildren: false,
        metrics,
        directMetrics: metrics,
        ...over,
    };
};

// Effective headcounts and their flags as the server works them out from the headcounts entered and the people
// on Lightdash, so a test never describes data the server cannot send
export const withServerHeadcounts = (
    departments: DepartmentWithMetrics[],
): DepartmentWithMetrics[] => {
    const effective = computeEffectiveHeadcounts(
        departments,
        new Map(
            departments.map((department) => [
                department.departmentUuid,
                department.metrics.memberCount,
            ]),
        ),
    );
    return departments.map((department) => {
        const value = effective.get(department.departmentUuid);
        return value === undefined ? department : { ...department, ...value };
    });
};

export const memberFixture = (
    userUuid: string,
    lastActiveAt: string | null,
    over: Partial<DepartmentMember> = {},
): DepartmentMember => ({
    userUuid,
    email: `${userUuid}@example.com`,
    firstName: userUuid,
    lastName: 'L',
    role: OrganizationMemberRole.VIEWER,
    departmentUuid: 'ops',
    departmentName: 'Operations',
    isDirect: true,
    source: 'explicit',
    sourceGroupName: null,
    lastActiveAt,
    isActive30d: false,
    queries30d: 0,
    dashboardViews30d: 0,
    ...over,
});

const seeded = (
    name: string,
    parentDepartmentUuid: string | null,
    headcount: number | null,
    members: number,
    directMembers: number = members,
): DepartmentWithMetrics =>
    dept(name, parentDepartmentUuid, null, {
        headcount,
        effectiveHeadcount: Math.max(headcount ?? 0, members),
        hasHeadcount: headcount !== null,
        metrics: metricsFixture(
            members,
            headcount === null ? null : Math.round((100 * members) / headcount),
            { activeCount30d: members, activeCount12w: members },
        ),
        directMetrics: metricsFixture(directMembers, null, {
            activeCount30d: directMembers,
            activeCount12w: directMembers,
        }),
    });

// A small organization with nesting, a missing headcount and almost nobody on Lightdash yet
export const seededOrganization = (): DepartmentWithMetrics[] =>
    withServerHeadcounts([
        seeded('Operations', null, 40, 1, 0),
        seeded('North', 'Operations', null, 1),
        seeded('Stores', 'Operations', 22, 0),
        seeded('Depots', 'Operations', 9, 0),
        seeded('Supply chain', null, 80, 0),
        seeded('Procurement', 'Supply chain', 30, 0),
        seeded('Logistics', 'Supply chain', 50, 0),
        seeded('Marketing', null, 40, 0),
        seeded('Finance', null, 32, 0),
        seeded('Data', null, 9, 1),
        seeded('Product', null, null, 1),
    ]);
