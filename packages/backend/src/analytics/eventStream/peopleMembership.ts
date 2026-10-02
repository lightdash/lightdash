import type { CompactedStreamColumn } from './types';

// One current organization membership per person. Groups stay on that row so
// overlapping memberships cannot multiply the adoption denominator.
export const peopleMembershipColumns: CompactedStreamColumn[] = [
    ...[
        'org_id',
        'user_id',
        'name',
        'organization_role',
        'role_id',
        'group_ids',
        'group_names',
    ].map((name) => ({ name, type: 'VARCHAR' as const })),
    ...['membership_created_at', 'snapshot_at'].map((name) => ({
        name,
        type: 'TIMESTAMP' as const,
    })),
    ...['is_active', 'is_setup_complete', 'is_eligible'].map((name) => ({
        name,
        type: 'BOOLEAN' as const,
    })),
];

// Preserve observed snapshots, including empty ones. A missed night is unknown
// membership history, never a license to backdate today's population.
export const peopleMembershipHistoryKey = (orgId: string, observedAt: Date) =>
    `events/compacted/org_id=${orgId}/model=people_membership/dt=${observedAt.toISOString().slice(0, 10)}/snapshot.parquet`;
