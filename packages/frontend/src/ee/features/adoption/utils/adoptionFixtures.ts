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
    weeklyActive: [],
    ...over,
});

export const dept = (
    name: string,
    parentDepartmentUuid: string | null,
    coveragePct: number | null,
    over: Partial<DepartmentWithMetrics> = {},
): DepartmentWithMetrics => ({
    departmentUuid: name,
    parentDepartmentUuid,
    name,
    headcount: coveragePct === null ? null : 10,
    headcountNote: null,
    targetActiveUsers: null,
    targetDate: null,
    owners: [],
    linkedGroups: [],
    explicitMemberUuids: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    effectiveHeadcount: coveragePct === null ? null : 10,
    headcountBelowChildren: false,
    metrics: metricsFixture(1, coveragePct),
    directMetrics: metricsFixture(1, coveragePct),
    ...over,
});
