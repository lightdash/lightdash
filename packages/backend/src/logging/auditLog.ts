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
    metadata: z.record(z.string(), z.unknown()).optional(),
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
 * Builds an audit actor for an authentication attempt where the user
 * could not be resolved (e.g. wrong password, expired/invalid token).
 * Includes the email when known so failed attempts are still attributable.
 */
export const createUnknownAuthActor = (email?: string): AuditActor => ({
    type: 'session',
    uuid: 'unknown',
    email: email ?? '',
    organizationUuid: 'unknown',
    organizationRole: 'unknown',
});
