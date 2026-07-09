import { z } from 'zod';

// Success metadata emitted by the createContent/editContent tools and consumed
// by the frontend (dashboard refresh planning, post-create navigation).
// name/warnings/versionUuids are optional for persisted results written before
// they existed; versionUuids is also only emitted by editContent.
export const contentToolSuccessMetadataSchema = z.object({
    status: z.literal('success'),
    slug: z.string(),
    uuid: z.string(),
    href: z.string(),
    name: z.string().optional(),
    warnings: z.array(z.string()).optional(),
    versionUuids: z
        .object({
            before: z.string().nullable(),
            after: z.string().nullable(),
        })
        .optional(),
});

export type ContentToolSuccessMetadata = z.infer<
    typeof contentToolSuccessMetadataSchema
>;

export const contentToolSuccessOutputSchema = z.object({
    status: z.literal('success'),
    metadata: contentToolSuccessMetadataSchema,
});
