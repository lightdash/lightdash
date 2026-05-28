import { z } from 'zod';

export const toolProposeWritebackOutputSchema = z.object({
    result: z.string(),
    metadata: z.discriminatedUnion('status', [
        z.object({
            status: z.literal('success'),
            prUrl: z.string().nullable(),
        }),
        z.object({
            status: z.literal('error'),
        }),
    ]),
});

export type ToolProposeWritebackOutput = z.infer<
    typeof toolProposeWritebackOutputSchema
>;

type ToolProposeWritebackResultLike = {
    toolType: string;
    toolName: string;
    metadata:
        | ToolProposeWritebackOutput['metadata']
        | Record<string, unknown>
        | null;
};

type ToolProposeWritebackResult = ToolProposeWritebackResultLike & {
    toolType: 'built-in';
    toolName: 'proposeWriteback';
    metadata: ToolProposeWritebackOutput['metadata'];
};

export const isToolProposeWritebackResult = <
    T extends ToolProposeWritebackResultLike,
>(
    result: T,
): result is T & ToolProposeWritebackResult =>
    result.toolType === 'built-in' &&
    result.toolName === 'proposeWriteback' &&
    toolProposeWritebackOutputSchema.shape.metadata.safeParse(result.metadata)
        .success;
