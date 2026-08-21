import { z } from 'zod';
import {
    toolRunQueryArgsSchemaPersisted,
    type ToolRunQueryArgsV3,
} from '../tools/toolRunQueryArgs';
import {
    toolRunQueryExpressionArgsSchema,
    toolRunQueryExpressionArgsSchemaV2,
    type ToolRunQueryExpressionArgs,
    type ToolRunQueryExpressionArgsV2,
} from './expressionSchemas';

const filterExpressionArtifactEnvelopeSchema = z
    .object({
        source: z.literal('filterExpression'),
        schemaVersion: z.literal(1),
        expressionArgs: z.unknown(),
        resolvedArgs: z.unknown(),
    })
    .strict();

export type AiFilterExpressionArtifactConfigV1 = {
    source: 'filterExpression';
    schemaVersion: 1;
    expressionArgs: ToolRunQueryExpressionArgs | ToolRunQueryExpressionArgsV2;
    resolvedArgs: ToolRunQueryArgsV3;
};

const hasMergeConfigProperty = (
    value: unknown,
): value is Record<string, unknown> & { mergeConfig: unknown } =>
    value !== null && typeof value === 'object' && 'mergeConfig' in value;

/**
 * Parses the persistence-only filter-expression envelope. Runtime readers must
 * normalize it to an existing semantic or merge artifact before exposing it.
 */
export const parseAiFilterExpressionArtifactConfigV1 = (
    raw: unknown,
): AiFilterExpressionArtifactConfigV1 | null => {
    const envelope = filterExpressionArtifactEnvelopeSchema.safeParse(raw);
    if (!envelope.success) return null;

    const expressionArgs = hasMergeConfigProperty(envelope.data.expressionArgs)
        ? toolRunQueryExpressionArgsSchema.safeParse(
              envelope.data.expressionArgs,
          )
        : toolRunQueryExpressionArgsSchemaV2.safeParse(
              envelope.data.expressionArgs,
          );
    if (!expressionArgs.success) return null;

    const resolvedArgs = toolRunQueryArgsSchemaPersisted.safeParse(
        envelope.data.resolvedArgs,
    );
    if (!resolvedArgs.success) return null;

    const expressionHasMerge =
        'mergeConfig' in expressionArgs.data &&
        expressionArgs.data.mergeConfig !== null;
    const resolvedHasMerge = resolvedArgs.data.mergeConfig !== null;
    if (expressionHasMerge !== resolvedHasMerge) return null;

    return {
        source: 'filterExpression',
        schemaVersion: 1,
        expressionArgs: expressionArgs.data,
        resolvedArgs: resolvedArgs.data,
    };
};
