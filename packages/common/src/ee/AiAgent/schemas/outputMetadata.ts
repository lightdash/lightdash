import { z } from 'zod';
import { AgentCapability } from '../../../types/agentPermissions';
import {
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    type AiAccessRefusal,
} from '../../../types/aiPrincipal';

const toolAccessRefusalSchema = z.object({
    code: z.literal('ai_access_refused'),
    reason: z.enum(AiAccessRefusalReason),
    message: z.string(),
    action: z.enum(AiAccessRefusalAction).nullable(),
    settingsUrl: z.string().nullable(),
    connectUrl: z.string().nullable(),
    capability: z.enum(AgentCapability).nullable().optional(),
    policyLayer: z
        .enum([
            'org_ceiling',
            'project_scope',
            'organization_setting',
            'warehouse_identity',
            'unmapped',
        ])
        .optional(),
    operation: z.string().optional(),
    policyVersion: z.number().optional(),
    projectUuid: z.string().nullable().optional(),
}) satisfies z.ZodType<AiAccessRefusal>;

export const baseOutputMetadataSchema = z.object({
    status: z.enum(['success', 'error']),
});

export type BaseOutputMetadata = z.infer<typeof baseOutputMetadataSchema>;

export const toolErrorStructuredContentSchema = z.object({
    refusal: toolAccessRefusalSchema.nullable().optional(),
    error: z
        .string()
        .describe('Why the tool call failed; the same message as `result`.'),
});

export type ToolErrorStructuredContent = z.infer<
    typeof toolErrorStructuredContentSchema
>;

const defaultContentStatuses = z.enum(['success']);
const defaultErrorStatuses = z.enum(['error']);

/**
 * Output envelope of every agent tool. `result` is the text the model reads,
 * `metadata` carries the status plus tool-specific diagnostics, and
 * `structuredContent` is the same answer as typed JSON: the tool's own shape on
 * success, `{ error }` on failure. It is required on every path so programs
 * (code mode) never have to parse text.
 */
export const structuredToolOutputSchema = <
    TMetadata extends z.ZodType,
    TStructuredContent extends z.ZodType,
    TContentStatuses extends z.ZodEnum<Record<string, string>> =
        typeof defaultContentStatuses,
    TErrorStatuses extends z.ZodEnum<Record<string, string>> =
        typeof defaultErrorStatuses,
>(schemas: {
    metadata: TMetadata;
    structuredContent: TStructuredContent;
    contentStatuses?: TContentStatuses;
    errorStatuses?: TErrorStatuses;
}) => {
    const contentStatuses = schemas.contentStatuses ?? defaultContentStatuses;
    const errorStatuses = schemas.errorStatuses ?? defaultErrorStatuses;
    const errors = new Set<string>(errorStatuses.options);
    if (contentStatuses.options.some((status) => errors.has(status))) {
        throw new Error(
            'Tool output content and error statuses must be disjoint',
        );
    }

    return z.union([
        z.object({
            result: z.string(),
            metadata: z.intersection(
                schemas.metadata,
                z.object({ status: contentStatuses }),
            ),
            structuredContent: schemas.structuredContent,
        }),
        z.object({
            result: z.string(),
            metadata: z.intersection(
                schemas.metadata,
                z.object({
                    status: errorStatuses,
                    refusal: toolAccessRefusalSchema.optional(),
                }),
            ),
            structuredContent: toolErrorStructuredContentSchema,
        }),
    ]);
};
