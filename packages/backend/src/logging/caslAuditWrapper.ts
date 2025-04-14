import { type Ability } from '@casl/ability';
import type { Rule as CaslRule } from '@casl/ability/dist/types/Rule';
import { Abilities, ForcedSubject } from '@casl/ability/dist/types/types';
import { CaslSubjectNames, type SessionUser } from '@lightdash/common';
import {
    AuditActor,
    AuditContext,
    AuditResource,
    AuditStatusType,
    createAuditLogEvent,
    type AuditLogEvent,
} from './auditLog';

export type AuditLogger = (event: AuditLogEvent) => void;

export type AuditableUser = Pick<
    SessionUser,
    | 'userUuid'
    | 'email'
    | 'firstName'
    | 'lastName'
    | 'organizationUuid'
    | 'role'
>;

// Todo: can we remove the & { properties } by improving typing of CaslSubjectNames?
type AuditableCaslSubject = ForcedSubject<CaslSubjectNames> & {
    organizationUuid: string;
    uuid: string;
    name?: string;
    projectUuid?: string;
};

type AuditHelperArgs = {
    user: AuditableUser;
    action: string;
    subject: AuditableCaslSubject;
    ip?: string;
    userAgent?: string;
    requestId?: string;
    ruleConditions?: string;
};

/**
 * Creates an audit actor from a user
 */
const createActorFromUser = (user: AuditableUser): AuditActor => ({
    uuid: user.userUuid,
    email: user.email || '',
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    organizationUuid: user.organizationUuid || '',
    organizationRole: user.role || 'unknown',
    // TODO: Add group memberships
    groupMemberships: [],
});

const createResourceFromSubject = (
    subject: AuditableCaslSubject,
): AuditResource => ({
    type: subject.__caslSubjectType__ || 'unknown',
    uuid: subject.uuid,
    name: subject.name,
    organizationUuid: subject.organizationUuid,
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

    private user: AuditableUser;

    private ip?: string;

    private userAgent?: string;

    private requestId?: string;

    private auditLogger: AuditLogger;

    constructor(
        ability: T,
        user: AuditableUser,
        options?: {
            ip?: string;
            userAgent?: string;
            requestId?: string;
            auditLogger?: AuditLogger;
        },
    ) {
        this.wrappedAbility = ability;
        this.user = user;
        this.ip = options?.ip;
        this.userAgent = options?.userAgent;
        this.requestId = options?.requestId;
        this.auditLogger = options?.auditLogger || ((_event) => {});
    }

    private logAbilityCheck(
        args: AuditHelperArgs,
        status: AuditStatusType,
        reason?: string,
    ): void {
        const actor = createActorFromUser(args.user);
        const resource = createResourceFromSubject(args.subject);
        const context = createContextFromArgs(args);

        const event = createAuditLogEvent(
            actor,
            args.action,
            resource,
            context,
            status,
            reason,
            args.ruleConditions,
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
                user: this.user,
                action,
                subject,
                ip: this.ip,
                userAgent: this.userAgent,
                requestId: this.requestId,
                ruleConditions,
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
                user: this.user,
                action,
                subject,
                ip: this.ip,
                userAgent: this.userAgent,
                requestId: this.requestId,
                ruleConditions,
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
