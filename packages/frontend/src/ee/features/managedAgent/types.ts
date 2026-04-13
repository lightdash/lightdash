export type ManagedAgentAction = {
    actionUuid: string;
    projectUuid: string;
    sessionId: string;
    actionType:
        | 'flagged_stale'
        | 'soft_deleted'
        | 'flagged_broken'
        | 'fixed_broken'
        | 'created_content'
        | 'insight';
    targetType: 'chart' | 'dashboard' | 'space' | 'project';
    targetUuid: string;
    targetName: string;
    description: string;
    metadata: Record<string, unknown>;
    reversedAt: string | null;
    reversedByUserUuid: string | null;
    createdAt: string;
};
