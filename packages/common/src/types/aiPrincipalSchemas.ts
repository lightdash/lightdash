import { z } from 'zod';
import {
    AiPrincipalFailureReason,
    AiProcedureRights,
    AiTransportKind,
} from './aiPrincipal';

export const aiTransportSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal(AiTransportKind.DIRECT) }),
    z.object({
        kind: z.literal(AiTransportKind.PROCEDURE),
        name: z.string().min(1),
        rights: z.nativeEnum(AiProcedureRights),
    }),
]);

const aiProbeObservedSchema = z.record(z.string(), z.string().nullable());
const aiProbeCheckedAtSchema = z
    .union([z.date(), z.string().datetime()])
    .transform((value) => (value instanceof Date ? value : new Date(value)));
export const aiProbeResultSchema = z.discriminatedUnion('ok', [
    z.object({
        ok: z.literal(true),
        checkedAt: aiProbeCheckedAtSchema,
        observed: aiProbeObservedSchema,
    }),
    z.object({
        ok: z.literal(false),
        transient: z.boolean(),
        checkedAt: aiProbeCheckedAtSchema,
        reason: z.nativeEnum(AiPrincipalFailureReason),
        message: z.string(),
        observed: aiProbeObservedSchema,
    }),
]);
