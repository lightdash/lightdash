import { type z } from 'zod';

// Guards persisted tool results (metadata comes from the DB), so the schema
// check must be a safeParse, never a throw.
export const makeBuiltInToolResultGuard =
    <Name extends string, Schema extends z.ZodType>(
        toolName: Name,
        metadataSchema: Schema,
    ) =>
    <T extends { toolType: string; toolName: string; metadata: unknown }>(
        result: T,
    ): result is T & {
        toolType: 'built-in';
        toolName: Name;
        metadata: z.infer<Schema>;
    } =>
        result.toolType === 'built-in' &&
        result.toolName === toolName &&
        metadataSchema.safeParse(result.metadata).success;
