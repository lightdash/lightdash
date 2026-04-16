import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

export type AuditStatusType = 'allowed' | 'denied' | 'allowed-bypass';

export const AuditStatusSchema = z.enum([
    'allowed',
    'denied',
    'allowed-bypass',
]);

// Discriminated union for audit actors
const BaseUserActorSchema = z.object({
    uuid: z.string(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    organizationUuid: z.string(),
    organizationRole: z.string(),
    groupMemberships: z.array(z.string()).optional(),
    impersonatedBy: z
        .object({
            uuid: z.string(),
            email: z.string().optional(),
            firstName: z.string().optional(),
            lastName: z.string().optional(),
            role: z.string(),
        })
        .optional(),
});

export const UserAuditActorSchema = BaseUserActorSchema.extend({
    type: z.enum(['session', 'pat', 'oauth']),
});

export const ServiceAccountAuditActorSchema = BaseUserActorSchema.extend({
    type: z.literal('service-account'),
});

export const AnonymousAuditActorSchema = z.object({
    type: z.literal('anonymous'),
    uuid: z.string(),
    organizationUuid: z.string(),
});

export const AuditActorSchema = z.discriminatedUnion('type', [
    UserAuditActorSchema,
    ServiceAccountAuditActorSchema,
    AnonymousAuditActorSchema,
]);

export type AuditActor = z.infer<typeof AuditActorSchema>;

export type CallStackEntry = {
    serviceName: string;
    methodName: string;
    depth: number;
};

export const AuditResourceSchema = z.object({
    type: z.string(),
    uuid: z.string().optional(),
    name: z.string().optional(),
    organizationUuid: z.string(),
    projectUuid: z.string().optional(),
});

export type AuditResource = z.infer<typeof AuditResourceSchema>;

export const AuditContextSchema = z.object({
    ip: z.string().optional(),
    userAgent: z.string().optional(),
    requestId: z.string().optional(),
});

export type AuditContext = z.infer<typeof AuditContextSchema>;

export const CallStackEntrySchema = z.object({
    serviceName: z.string(),
    methodName: z.string(),
    depth: z.number(),
});

export const AuditLogEventSchema = z.object({
    id: z.string().default(() => uuidv4()),
    timestamp: z.string().default(() => new Date().toISOString()),
    actor: AuditActorSchema,
    action: z.string(),
    resource: AuditResourceSchema,
    context: AuditContextSchema,
    status: AuditStatusSchema,
    reason: z.string().optional(),
    ruleConditions: z.string().optional(),
    callStack: z.array(CallStackEntrySchema).optional(),
});

export type AuditLogEvent = z.infer<typeof AuditLogEventSchema>;

export const validateAuditLogEvent = (event: unknown): AuditLogEvent =>
    AuditLogEventSchema.parse(event);

export const createAuditLogEvent = (
    actor: AuditActor,
    action: string,
    resource: AuditResource,
    context: AuditContext,
    status: AuditStatusType,
    reason?: string,
    ruleConditions?: string,
    callStack?: CallStackEntry[],
): AuditLogEvent =>
    validateAuditLogEvent({
        actor,
        action,
        resource,
        context,
        status,
        reason,
        ruleConditions,
        callStack,
    });

/**
 * Creates a minimal audit actor for failed auth attempts where the user
 * may not exist in the system.
 */
export const createUnknownActor = (email?: string): AuditActor => ({
    type: 'session' as const,
    uuid: 'unknown',
    email: email || 'unknown',
    organizationUuid: 'unknown',
    organizationRole: 'unknown',
});

/**
 * Creates an audit log event for authentication actions (login, logout, etc.).
 * Unlike CASL audit events, these don't have CASL rules or conditions.
 */
export const createAuthAuditEvent = ({
    actor,
    action,
    resourceType,
    resourceUuid,
    organizationUuid,
    context,
    status,
    reason,
}: {
    actor: AuditActor;
    action: string;
    resourceType: string;
    resourceUuid?: string;
    organizationUuid: string;
    context?: AuditContext;
    status: AuditStatusType;
    reason?: string;
}): AuditLogEvent =>
    createAuditLogEvent(
        actor,
        action,
        { type: resourceType, uuid: resourceUuid, organizationUuid },
        context || {},
        status,
        reason,
    );
