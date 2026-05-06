import {
    type ManagedAgentActionType,
    type ManagedAgentTargetType,
} from '@lightdash/common';

export type ManagedAgentAction = {
    actionUuid: string;
    projectUuid: string;
    sessionId: string;
    actionType: ManagedAgentActionType;
    targetType: ManagedAgentTargetType;
    targetUuid: string;
    targetName: string;
    description: string;
    metadata: Record<string, unknown>;
    reversedAt: string | null;
    reversedByUserUuid: string | null;
    createdAt: string;
};
