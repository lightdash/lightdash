import {
    type ManagedAgentActionType,
    type ManagedAgentTargetType,
} from '@lightdash/common';

export type ManagedAgentActionUser = {
    userUuid: string;
    firstName: string;
    lastName: string;
};

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
    reversedByUser: ManagedAgentActionUser | null;
    createdAt: string;
};
