import { subject, type Ability } from '@casl/ability';
import {
    isAccount,
    isJwtUser,
    type Account,
    type SessionUser,
} from '@lightdash/common';
import type { AuditResource } from '../logging/auditLog';
import { captureServiceCallStack } from '../logging/callStack';
import {
    CaslAuditWrapper,
    createActorFromAccount,
    createActorFromUser,
} from '../logging/caslAuditWrapper';
import Logger from '../logging/logger';
import { logAuditEvent, winstonLogger } from '../logging/winston';

export abstract class BaseService {
    protected logger: typeof Logger;

    constructor({
        logger,
        serviceName,
        loggerParams,
    }: {
        logger?: typeof Logger;

        /** If provided, is used for things like instancing the child logger */
        serviceName?: string;

        /**
         * Arbitrary values passed to a child logger, if `logger` is not provided.
         */
        loggerParams?: Record<string, unknown>;
    } = {}) {
        /**
         * Logger can be overriden as part of the constructor, e.g to provide a scoped
         * logger instance.
         */
        this.logger =
            logger ??
            Logger.child({
                serviceName: serviceName ?? this.constructor.name,
                ...(loggerParams ?? {}),
            });
    }

    /**
     * Creates a CASL ability wrapper that automatically logs audit events
     * for all permission checks (can/cannot).
     *
     * Use this instead of accessing `user.ability` or `account.user.ability` directly.
     *
     * @example
     * ```typescript
     * const ability = this.createAuditedAbility(account);
     * if (ability.cannot('view', subject('Dashboard', dashboard))) {
     *     throw new ForbiddenError();
     * }
     * ```
     */
    protected createAuditedAbility(
        accountOrUser: Account | SessionUser,
    ): CaslAuditWrapper<Ability> {
        const auditEnabled = winstonLogger.isLevelEnabled('audit');
        const callStack = auditEnabled ? captureServiceCallStack() : undefined;

        if (isAccount(accountOrUser)) {
            this.logger.debug('Creating audited ability', {
                accountType: accountOrUser.authentication.type,
            });
            const { requestContext } = accountOrUser;
            return new CaslAuditWrapper(
                accountOrUser.user.ability,
                accountOrUser,
                {
                    callStack,
                    auditLogger: logAuditEvent,
                    auditEnabled,
                    ip: requestContext?.ip,
                    userAgent: requestContext?.userAgent,
                    requestId: requestContext?.requestId,
                },
            );
        }

        // Legacy SessionUser type
        this.logger.debug('Creating audited ability', {
            accountType: 'session-user',
        });
        const { requestContext } = accountOrUser;
        return new CaslAuditWrapper(accountOrUser.ability, accountOrUser, {
            callStack,
            auditLogger: logAuditEvent,
            auditEnabled,
            ip: requestContext?.ip,
            userAgent: requestContext?.userAgent,
            requestId: requestContext?.requestId,
        });
    }

    /** Embed viewers see compiled SQL only when their token grants view:EmbedCompiledSql. */
    protected cannotViewEmbedCompiledSql(
        account: Account,
        projectUuid: string,
    ): boolean {
        return (
            isJwtUser(account) &&
            this.createAuditedAbility(account).cannot(
                'view',
                subject('EmbedCompiledSql', {
                    organizationUuid:
                        account.embed.organization.organizationUuid,
                    projectUuid,
                }),
            )
        );
    }

    /**
     * Logs an audit event for operations where permission checks are bypassed
     * (e.g., cascaded soft-delete/restore where the parent already checked permissions).
     */
    protected logBypassEvent(
        accountOrUser: Account | SessionUser,
        action: string,
        resource: AuditResource,
    ): void {
        if (!winstonLogger.isLevelEnabled('audit')) return;

        try {
            const actor = isAccount(accountOrUser)
                ? createActorFromAccount(accountOrUser)
                : createActorFromUser(accountOrUser);
            const callStack = captureServiceCallStack();

            logAuditEvent({
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                actor,
                action,
                resource,
                context: {},
                status: 'allowed-bypass',
                callStack,
            });
        } catch (err) {
            this.logger.warn('Failed to log bypass audit event', {
                error: err instanceof Error ? err.message : String(err),
                action,
                resourceType: resource.type,
            });
        }
    }
}
