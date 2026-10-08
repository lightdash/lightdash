import {
    type AdoptionMetrics,
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
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        effectiveHeadcount: headcount,
        headcountBelowChildren: false,
        metrics,
        directMetrics: metrics,
        ...over,
    };
};
