import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

export type AuditStatusType = 'allowed' | 'denied';

export const AuditStatusSchema = z.enum(['allowed', 'denied']);

export const AuditActorSchema = z.object({
    uuid: z.string(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    organizationUuid: z.string(),
    organizationRole: z.string(),
    groupMemberships: z.array(z.string()).optional(),
});

export type AuditActor = z.infer<typeof AuditActorSchema>;

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
): AuditLogEvent =>
    validateAuditLogEvent({
        actor,
        action,
        resource,
        context,
        status,
        reason,
        ruleConditions,
    });
