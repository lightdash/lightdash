import type { CompactedStreamColumn } from './types';

/** Current inventory, published atomically by the existing dimension refresher. */
export const contentInventoryColumns: CompactedStreamColumn[] = [
    ...[
        'org_id',
        'project_id',
        'project_name',
        'content_type',
        'content_id',
        'content_name',
        'space_id',
        'space_name',
        'owner_id',
        'owner_name',
        'owner_status',
    ].map((name) => ({ name, type: 'VARCHAR' as const })),
    ...['created_at', 'deleted_at', 'snapshot_at'].map((name) => ({
        name,
        type: 'TIMESTAMP' as const,
    })),
    { name: 'is_deleted', type: 'BOOLEAN' },
    { name: 'is_verified', type: 'BOOLEAN' },
    { name: 'dashboard_references', type: 'BIGINT' },
    { name: 'enabled_schedules', type: 'BIGINT' },
];
