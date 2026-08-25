import {
    createAuditLogEvent,
    type AuditActor,
    type AuditContext,
    type AuditLogEvent,
} from '../../logging/auditLog';
import Logger from '../../logging/logger';
import { logAuditEvent } from '../../logging/winston';
import {
    type DirectAccessMutationResult,
    type DirectAccessResetResult,
} from '../../models/directAccessModelUtils';

export type DirectAccessAuditLogger = (event: AuditLogEvent) => void;

type Principal =
    | { type: 'user'; uuid: string }
    | { type: 'group'; uuid: string };

export const auditDirectAccessMutation = ({
    actor,
    context,
    resourceType,
    resourceUuid,
    principal,
    result,
    auditLogger = logAuditEvent,
}: {
    actor: AuditActor;
    context: AuditContext;
    resourceType: string;
    resourceUuid: string;
    principal: Principal;
    result: DirectAccessMutationResult;
    auditLogger?: DirectAccessAuditLogger;
}): void => {
    let action = 'direct_access.role_change';
    if (result.afterRole === null) {
        action = 'direct_access.revoke';
    } else if (result.beforeRole === null) {
        action = 'direct_access.grant';
    }
    try {
        auditLogger(
            createAuditLogEvent(
                actor,
                action,
                {
                    type: resourceType,
                    organizationUuid: result.organizationUuid,
                    projectUuid: result.projectUuid,
                    metadata: {
                        resourceUuid,
                        principalType: principal.type,
                        principalUuid: principal.uuid,
                        beforeRole: result.beforeRole,
                        afterRole: result.afterRole,
                    },
                },
                context,
                'allowed',
            ),
        );
    } catch (error) {
        Logger.warn('Failed to write direct access audit event', { error });
    }
};

export const auditDirectAccessReset = ({
    actor,
    context,
    resourceType,
    resourceUuid,
    result,
    auditLogger = logAuditEvent,
}: {
    actor: AuditActor;
    context: AuditContext;
    resourceType: string;
    resourceUuid: string;
    result: DirectAccessResetResult;
    auditLogger?: DirectAccessAuditLogger;
}): void => {
    try {
        auditLogger(
            createAuditLogEvent(
                actor,
                'direct_access.reset',
                {
                    type: resourceType,
                    organizationUuid: result.organizationUuid,
                    projectUuid: result.projectUuid,
                    metadata: {
                        resourceUuid,
                        revokedUsers: result.revokedUsers,
                        revokedGroups: result.revokedGroups,
                    },
                },
                context,
                'allowed',
            ),
        );
    } catch (error) {
        Logger.warn('Failed to write direct access reset audit event', {
            error,
        });
    }
};
