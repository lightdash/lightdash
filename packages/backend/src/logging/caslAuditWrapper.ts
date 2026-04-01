import { type Ability } from '@casl/ability';
import type { Rule as CaslRule } from '@casl/ability/dist/types/Rule';
import { Abilities, ForcedSubject } from '@casl/ability/dist/types/types';
import {
    CaslSubjectNames,
    type Account,
    type AnonymousAccount,
    type SessionUser,
} from '@lightdash/common';
import {
    createAuditLogEvent,
    type AuditActor,
    type AuditContext,
    type AuditLogEvent,
    type AuditResource,
    type AuditStatusType,
    type CallStackEntry,
} from './auditLog';

export type AuditLogger = (event: AuditLogEvent) => void;

/**
 * @deprecated Use Account type directly with createAuditedAbility() in BaseService.
 * Kept for backward compatibility during migration.
 */
export type AuditableUser = Pick<
    SessionUser,
    | 'userUuid'
    | 'email'
    | 'firstName'
    | 'lastName'
    | 'organizationUuid'
    | 'role'
    | 'impersonation'
>;

// Todo: can we remove the & { properties } by improving typing of CaslSubjectNames?
type AuditableCaslSubject = ForcedSubject<CaslSubjectNames> & {
    organizationUuid?: string;
    uuid?: string;
    name?: string;
    projectUuid?: string;
};

type AuditHelperArgs = {
    actor: AuditActor;
    action: string;
    subject: AuditableCaslSubject;
    ip?: string;
    userAgent?: string;
    requestId?: string;
    ruleConditions?: string;
    callStack?: CallStackEntry[];
};

/**
 * Creates an audit actor from an Account (discriminated union by auth type)
 */
export const createActorFromAccount = (account: Account): AuditActor => {
    if (account.isAnonymousUser()) {
        const anonAccount = account as AnonymousAccount;
        return {
            type: 'anonymous' as const,
            uuid: anonAccount.user.id,
            organizationUuid:
                anonAccount.organization.organizationUuid || 'unknown',
        };
    }

    if (account.isServiceAccount()) {
        return {
            type: 'service-account' as const,
            uuid: account.user.id,
            email: account.user.email || '',
            organizationUuid:
                account.organization.organizationUuid || 'unknown',
            organizationRole:
                'role' in account.user
                    ? (account.user as { role?: string }).role || 'unknown'
                    : 'unknown',
        };
    }

    // Session, PAT, or OAuth users
    const authType = account.authentication.type;
    const actorType =
        authType === 'session' || authType === 'pat' || authType === 'oauth'
            ? authType
            : 'session';

    const user = account.user as {
        userUuid?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        role?: string;
        id: string;
        impersonation?: {
            adminUserUuid: string;
            adminEmail: string;
            adminFirstName: string;
            adminLastName: string;
            adminRole: string;
        };
    };

    return {
        type: actorType,
        uuid: user.userUuid || user.id,
        email: user.email || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        organizationUuid: account.organization.organizationUuid || 'unknown',
        organizationRole: user.role || 'unknown',
        // TODO: Add group memberships
        groupMemberships: [],
        ...(user.impersonation && {
            impersonatedBy: {
                uuid: user.impersonation.adminUserUuid,
                email: user.impersonation.adminEmail,
                firstName: user.impersonation.adminFirstName,
                lastName: user.impersonation.adminLastName,
                role: user.impersonation.adminRole,
            },
        }),
    };
};

/**
 * Creates an audit actor from a SessionUser (legacy support)
 * @deprecated Prefer createActorFromAccount with Account type
 */
export const createActorFromUser = (user: AuditableUser): AuditActor => ({
    type: 'session' as const,
    uuid: user.userUuid,
    email: user.email || '',
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    organizationUuid: user.organizationUuid || '',
    organizationRole: user.role || 'unknown',
    // TODO: Add group memberships
    groupMemberships: [],
    ...(user.impersonation && {
        impersonatedBy: {
            uuid: user.impersonation.adminUserUuid,
            email: user.impersonation.adminEmail,
            firstName: user.impersonation.adminFirstName,
            lastName: user.impersonation.adminLastName,
            role: user.impersonation.adminRole,
        },
    }),
});

const createResourceFromSubject = (
    subject: AuditableCaslSubject,
): AuditResource => ({
    type: subject.__caslSubjectType__ || 'unknown',
    uuid: subject.uuid,
    name: subject.name,
    organizationUuid: subject.organizationUuid || 'unknown',
    projectUuid: subject.projectUuid,
});

const createContextFromArgs = (args: AuditHelperArgs): AuditContext => ({
    ip: args.ip,
    userAgent: args.userAgent,
    requestId: args.requestId,
});

// Helper function to extract conditions from a CASL Rule
const extractRuleConditions = <A extends Abilities, C>(
    rule: CaslRule<A, C> | null,
): string | undefined => {
    if (!rule) return undefined;

    try {
        // Get conditions directly from Rule object's conditions property
        const { conditions } = rule;

        if (conditions && typeof conditions === 'object') {
            return JSON.stringify(conditions);
        }

        return undefined;
    } catch (e) {
        return undefined;
    }
};

export class CaslAuditWrapper<T extends Ability> {
    private wrappedAbility: T;

    private actor: AuditActor;

    private ip?: string;

    private userAgent?: string;

    private requestId?: string;

    private callStack?: CallStackEntry[];

    private auditLogger: AuditLogger;

    constructor(
        ability: T,
        actorSource: Account | AuditableUser,
        options?: {
            ip?: string;
            userAgent?: string;
            requestId?: string;
            callStack?: CallStackEntry[];
            auditLogger?: AuditLogger;
        },
    ) {
        this.wrappedAbility = ability;

        // Determine if actorSource is an Account or legacy AuditableUser
        if ('authentication' in actorSource) {
            this.actor = createActorFromAccount(actorSource as Account);
        } else {
            this.actor = createActorFromUser(actorSource as AuditableUser);
        }

        this.ip = options?.ip;
        this.userAgent = options?.userAgent;
        this.requestId = options?.requestId;
        this.callStack = options?.callStack;
        this.auditLogger = options?.auditLogger || ((_event) => {});
    }

    private logAbilityCheck(
        args: AuditHelperArgs,
        status: AuditStatusType,
        reason?: string,
    ): void {
        const resource = createResourceFromSubject(args.subject);
        const context = createContextFromArgs(args);

        const event = createAuditLogEvent(
            args.actor,
            args.action,
            resource,
            context,
            status,
            reason,
            args.ruleConditions,
            args.callStack,
        );

        this.auditLogger(event);
    }

    can(action: string, subject: AuditableCaslSubject): boolean {
        const result = this.wrappedAbility.can(action, subject);

        // Extract the relevant rule that allowed this permission
        const rule = this.wrappedAbility.relevantRuleFor(action, subject);
        const ruleConditions = extractRuleConditions(rule);

        const reason = rule?.reason;

        this.logAbilityCheck(
            {
                actor: this.actor,
                action,
                subject,
                ip: this.ip,
                userAgent: this.userAgent,
                requestId: this.requestId,
                ruleConditions,
                callStack: this.callStack,
            },
            result ? 'allowed' : 'denied',
            reason,
        );
        return result;
    }

    cannot(action: string, subject: AuditableCaslSubject): boolean {
        const result = this.wrappedAbility.cannot(action, subject);

        const rule = this.wrappedAbility.relevantRuleFor(action, subject);
        const ruleConditions = extractRuleConditions(rule);
        const reason = rule?.reason;

        this.logAbilityCheck(
            {
                actor: this.actor,
                action,
                subject,
                ip: this.ip,
                userAgent: this.userAgent,
                requestId: this.requestId,
                ruleConditions,
                callStack: this.callStack,
            },
            result ? 'denied' : 'allowed',
            reason,
        );
        return result;
    }

    // Forward any property access to the wrapped ability
    get rules() {
        return this.wrappedAbility.rules;
    }
}
