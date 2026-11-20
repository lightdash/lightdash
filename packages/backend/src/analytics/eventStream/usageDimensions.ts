import { agentEvaluationRunColumns } from './agentEvaluationRuns';
import { contentInventoryColumns } from './contentInventory';
import { peopleMembershipColumns } from './peopleMembership';
import type { CompactedStreamColumn } from './types';

export const usageDimensionNames = [
    'charts',
    'dashboards',
    'users',
    'agents',
    'projects',
    'content',
    'people',
    'agent_evaluation_runs',
] as const;
export type UsageDimensionName = (typeof usageDimensionNames)[number];

export const usageDimensionSchemas: Record<
    UsageDimensionName,
    CompactedStreamColumn[]
> = {
    content: contentInventoryColumns,
    people: peopleMembershipColumns,
    agent_evaluation_runs: agentEvaluationRunColumns,
    charts: [
        { name: 'org_id', type: 'VARCHAR' },
        { name: 'chart_id', type: 'VARCHAR' },
        { name: 'name', type: 'VARCHAR' },
        { name: 'slug', type: 'VARCHAR' },
        { name: 'url', type: 'VARCHAR' },
        { name: 'chart_kind', type: 'VARCHAR' },
        { name: 'space_name', type: 'VARCHAR' },
        { name: 'is_deleted', type: 'BOOLEAN' },
    ],
    dashboards: [
        { name: 'org_id', type: 'VARCHAR' },
        { name: 'dashboard_id', type: 'VARCHAR' },
        { name: 'name', type: 'VARCHAR' },
        { name: 'slug', type: 'VARCHAR' },
        { name: 'url', type: 'VARCHAR' },
        { name: 'space_name', type: 'VARCHAR' },
        { name: 'is_deleted', type: 'BOOLEAN' },
    ],
    users: [
        { name: 'org_id', type: 'VARCHAR' },
        { name: 'user_id', type: 'VARCHAR' },
        { name: 'name', type: 'VARCHAR' },
        { name: 'email', type: 'VARCHAR' },
        // False for a deactivated member. Empty in a snapshot written before this column existed.
        { name: 'is_active', type: 'BOOLEAN' },
    ],
    agents: [
        { name: 'org_id', type: 'VARCHAR' },
        { name: 'agent_id', type: 'VARCHAR' },
        { name: 'name', type: 'VARCHAR' },
    ],
    projects: [
        { name: 'org_id', type: 'VARCHAR' },
        { name: 'project_id', type: 'VARCHAR' },
        { name: 'name', type: 'VARCHAR' },
    ],
};

export const usageDimensionTable = (dimension: UsageDimensionName): string =>
    `lightdash_${dimension}`;

export const usageDimensionKey = (
    orgId: string,
    dimension: UsageDimensionName,
): string =>
    `events/compacted/org_id=${orgId}/dim=${dimension}/${dimension}.parquet`;
