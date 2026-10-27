import { isAccount, type Account, type SessionUser } from '@lightdash/common';
import { createAuditLogEvent } from '../logging/auditLog';
import {
    createActorFromAccount,
    createActorFromUser,
} from '../logging/caslAuditWrapper';
import Logger from '../logging/logger';
import { redactCredentialError } from '../logging/redactCredentialError';
import { logAuditEvent } from '../logging/winston';

export const recordGroupMembershipChange = (
    actor: Account | SessionUser,
    organizationUuid: string,
    groupUuid: string,
    change: {
        operation: 'add' | 'remove' | 'replace' | 'delete';
        memberUuids: string[] | null;
    },
): void => {
    try {
        logAuditEvent(
            createAuditLogEvent(
                isAccount(actor)
                    ? createActorFromAccount(actor)
                    : createActorFromUser(actor),
                'update',
                {
                    type: 'Group',
                    organizationUuid,
                    metadata: {
                        event: 'group.membership_changed',
                        groupUuid,
                        ...change,
                    },
                },
                actor.requestContext ?? {},
                'allowed',
            ),
        );
    } catch (error) {
        Logger.warn(
            'Failed to write the group membership audit event',
            redactCredentialError(error),
        );
    }
};
