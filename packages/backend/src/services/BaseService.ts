import { type Ability } from '@casl/ability';
import { isAccount, type Account, type SessionUser } from '@lightdash/common';
import type { AuditResource, CallStackEntry } from '../logging/auditLog';
import {
    CaslAuditWrapper,
    createActorFromAccount,
    createActorFromUser,
} from '../logging/caslAuditWrapper';
import Logger from '../logging/logger';
import { logAuditEvent } from '../logging/winston';

const SKIP_METHODS = new Set(['createAuditedAbility', 'constructor']);

/**
 * Captures the service call stack from the current stack trace.
 * Extracts up to `maxDepth` service method calls by looking for
 * class methods on classes ending in "Service".
 */
const captureCallStack = (maxDepth: number = 10): CallStackEntry[] => {
    const { stack } = new Error();
    if (!stack) return [];

    const entries: CallStackEntry[] = [];
    const lines = stack.split('\n');

    // eslint-disable-next-line no-restricted-syntax
    for (const line of lines) {
        if (entries.length >= maxDepth) break;

        // Match patterns like "at ClassName.methodName" where ClassName ends with Service
        const match = line.match(/at (\w*Service)\.(\w+)/);
        if (match && !SKIP_METHODS.has(match[2])) {
            entries.push({
                serviceName: match[1],
                methodName: match[2],
                depth: entries.length,
            });
        }
    }

    return entries;
};

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
        const callStack = captureCallStack();

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
            ip: requestContext?.ip,
            userAgent: requestContext?.userAgent,
            requestId: requestContext?.requestId,
        });
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
        try {
            const actor = isAccount(accountOrUser)
                ? createActorFromAccount(accountOrUser)
                : createActorFromUser(accountOrUser);
            const callStack = captureCallStack();

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
