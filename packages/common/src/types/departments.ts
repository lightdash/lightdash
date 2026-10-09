import { type OrganizationMemberRole } from './organizationMemberProfile';

export type DepartmentOwnerType = 'user' | 'group';
export type DepartmentOwnerInput = { type: DepartmentOwnerType; uuid: string };
export type DepartmentOwner = {
    type: DepartmentOwnerType;
    uuid: string;
    name: string;
};

export type DepartmentLinkedGroup = { groupUuid: string; name: string };

export type Department = {
    departmentUuid: string;
    parentDepartmentUuid: string | null;
    name: string;
    headcount: number | null;
    headcountNote: string | null;
    targetActiveUsers: number | null;
    targetDate: string | null; // ISO date, YYYY-MM-DD
    owners: DepartmentOwner[]; // ordered, first is the display owner
    linkedGroups: DepartmentLinkedGroup[];
    explicitMemberUuids: string[];
};

export type CreateDepartment = {
    name: string;
    parentDepartmentUuid: string | null;
    headcount: number | null;
    headcountNote: string | null;
    targetActiveUsers: number | null;
    targetDate: string | null;
};

// Omitted field = leave unchanged, null = clear
export type UpdateDepartment = {
    name?: string;
    parentDepartmentUuid?: string | null;
    headcount?: number | null;
    headcountNote?: string | null;
    targetActiveUsers?: number | null;
    targetDate?: string | null;
};

export type SetDepartmentGroups = { groupUuids: string[] };
export type SetDepartmentMembers = { userUuids: string[] };
export type SetDepartmentOwners = { owners: DepartmentOwnerInput[] };

export type RoleSplit = {
    viewers: number;
    interactiveViewers: number;
    editors: number;
    admins: number;
};

// Where a person on Lightdash falls by their last activity; see HEALTHY_ACTIVITY_DAYS for the bounds
export type ActivityBucket = 'healthy' | 'atRisk' | 'lost';

export type ActivitySplit = {
    healthy: number;
    atRisk: number;
    lost: number;
};

export type WeeklyActivePoint = { weekStart: string; activeUsers: number };

export type AdoptionMetrics = {
    memberCount: number;
    activeCount30d: number;
    activeCount12w: number; // active in 30 days, or a chart or dashboard view in the 12-week trend window
    coveragePct: number | null; // of the effective headcount, so never above 100; null only when that is 0
    activePct: number | null;
    roleSplit: RoleSplit;
    activitySplit: ActivitySplit; // the people on Lightdash by their last activity; healthy is activeCount30d
    weeklyActive: WeeklyActivePoint[]; // 12 points, oldest first; chart and dashboard views only
};

export type DepartmentWithMetrics = Department & {
    effectiveHeadcount: number; // own if set, else sum of children; never below the children's plus its own members
    hasHeadcount: boolean; // a headcount is entered on the department or on one below it
    headcountBelowChildren: boolean;
    metrics: AdoptionMetrics; // rolled up: own members plus all descendants'
    directMetrics: AdoptionMetrics; // members resolved to this department itself; percentages of its residual headcount
};

export type OrganizationAdoptionSummary = {
    organization: AdoptionMetrics;
    departments: DepartmentWithMetrics[]; // flat, tree is in parentDepartmentUuid
    attention: { conflictCount: number; unassignedCount: number };
};

export type MembershipResolution =
    | {
          kind: 'assigned';
          departmentUuid: string;
          source: 'explicit' | 'group';
          sourceGroupName: string | null; // set when source is group
      }
    | { kind: 'conflict'; departmentUuids: string[] }
    | { kind: 'unassigned' };

export type DepartmentMembership = {
    userUuid: string;
    email: string;
    firstName: string;
    lastName: string;
    role: OrganizationMemberRole;
    resolution: MembershipResolution;
};

export type DepartmentGroupLink = {
    departmentUuid: string;
    groupUuid: string;
    groupName: string;
};

// Raw row the model returns, one per org user
export type ResolvedMemberRow = {
    userUuid: string;
    email: string;
    firstName: string;
    lastName: string;
    role: OrganizationMemberRole;
    explicitDepartmentUuid: string | null;
    groupLinks: DepartmentGroupLink[];
};

export type ApiOrganizationAdoptionSummaryResponse = {
    status: 'ok';
    results: OrganizationAdoptionSummary;
};
export type ApiDepartmentResponse = { status: 'ok'; results: Department };
export type ApiDepartmentMembershipResponse = {
    status: 'ok';
    results: DepartmentMembership[];
};

export type DepartmentRef = { departmentUuid: string; name: string };

export type DepartmentTargetProgress = {
    targetActiveUsers: number;
    targetDate: string | null;
    activeUsers: number;
    remaining: number; // never negative
    weeksLeft: number | null; // null without a target date, negative once it has passed
};

export type DepartmentWeeklyActivePoint = {
    weekStart: string;
    activeUsers: number;
    orgAverage: number; // mean across departments at the same level
};

export type DepartmentTopContentItem = {
    id: string;
    name: string;
    projectUuid: string; // the project the content is in, for its link
    count: number;
    distinctPeople: number;
};

export type DepartmentTopContent = {
    dashboards: DepartmentTopContentItem[];
    explores: DepartmentTopContentItem[];
    aiAgents: DepartmentTopContentItem[];
};

export type DepartmentMember = {
    userUuid: string;
    email: string;
    firstName: string;
    lastName: string;
    role: OrganizationMemberRole;
    departmentUuid: string; // where the person resolved, this department or a descendant
    departmentName: string;
    isDirect: boolean;
    source: 'explicit' | 'group';
    sourceGroupName: string | null;
    lastActiveAt: string | null; // ISO timestamp, null = no recorded activity (queries are only kept for a limited time)
    isActive30d: boolean; // same definition and bound as activeCount30d
    activity: ActivityBucket; // same bounds as activitySplit
    queries30d: number;
    dashboardViews30d: number;
};

export type DepartmentDetail = {
    department: DepartmentWithMetrics;
    ancestors: DepartmentRef[]; // top level first
    children: DepartmentWithMetrics[];
    targetProgress: DepartmentTargetProgress | null;
    weeklyActive: DepartmentWeeklyActivePoint[];
    topContent: DepartmentTopContent;
    members: DepartmentMember[];
};

export type ApiDepartmentDetailResponse = {
    status: 'ok';
    results: DepartmentDetail;
};
