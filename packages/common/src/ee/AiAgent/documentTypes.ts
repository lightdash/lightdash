import { z } from 'zod';

export const AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES = 20 * 1024;
export const AI_AGENT_DOCUMENT_ORG_QUOTA_BYTES = 5 * 1024 * 1024;

export type AiAgentDocument = {
    uuid: string;
    organizationUuid: string;
    projectUuid: string | null;
    name: string;
    originalFilename: string;
    mimeType: string;
    contentSizeBytes: number;
    summary: string;
    storageKey: string;
    agentAccess: string[];
    createdByUserUuid: string | null;
    updatedByUserUuid: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type AiAgentDocumentSummary = Omit<AiAgentDocument, 'storageKey'>;

export type AiAgentDocumentContent = Pick<
    AiAgentDocument,
    'uuid' | 'name' | 'mimeType'
> & {
    content: string;
};

export const apiCreateAiAgentDocumentSchema = z.object({
    name: z.string().min(1).max(255),
    originalFilename: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(255),
    content: z
        .string()
        .min(1)
        .refine(
            (value) =>
                Buffer.byteLength(value, 'utf8') <=
                AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES,
            {
                message: `Content exceeds the ${AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES} byte limit.`,
            },
        ),
    summary: z.string().min(1),
    projectUuid: z.string().uuid().nullable().optional(),
    agentAccess: z.array(z.string().uuid()).optional(),
});

export type ApiCreateAiAgentDocument = z.infer<
    typeof apiCreateAiAgentDocumentSchema
>;

export const apiUpdateAiAgentDocumentSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    projectUuid: z.string().uuid().nullable().optional(),
    agentAccess: z.array(z.string().uuid()).optional(),
});

export type ApiUpdateAiAgentDocument = z.infer<
    typeof apiUpdateAiAgentDocumentSchema
>;
