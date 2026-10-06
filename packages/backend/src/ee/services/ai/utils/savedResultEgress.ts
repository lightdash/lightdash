import {
    QueryExecutionContext,
    QueryHistoryStatus,
    type AiAgentToolResult,
    type QueryHistory,
} from '@lightdash/common';
import { z } from 'zod';
import { shapeRowsInResult } from '../../AiAgentMemoryService/transcriptToolPolicy';

export const savedQueryMetadataSchema = z.object({
    status: z.literal('success'),
    queryUuid: z.string().uuid(),
    queryCacheHit: z.literal(false),
    queryReuseHit: z.boolean().optional(),
});

export const getSavedQueryAiSignInProvenance = (
    metadata: unknown,
    history: QueryHistory | null,
    userUuid: string,
): {
    aiSignInFetchedRows: true;
    aiSignInUserUuid: string;
    aiSignInCredentialUuid: string;
} | null => {
    const parsed = savedQueryMetadataSchema.safeParse(metadata);
    const aiSignInCredentialUuid =
        history?.requestParameters.aiSignInCredentialUuid;
    if (
        !parsed.success ||
        parsed.data.queryReuseHit === true ||
        history?.queryUuid !== parsed.data.queryUuid ||
        history?.context !== QueryExecutionContext.AI ||
        history.status !== QueryHistoryStatus.READY ||
        history.createdByUserUuid !== userUuid ||
        history.preAggregateExecution !== null ||
        !aiSignInCredentialUuid
    ) {
        return null;
    }
    return {
        aiSignInFetchedRows: true,
        aiSignInUserUuid: userUuid,
        aiSignInCredentialUuid,
    };
};

const aiSignInProvenanceSchema = z.object({
    aiSignInFetchedRows: z.literal(true),
    aiSignInUserUuid: z.string().uuid(),
    aiSignInCredentialUuid: z.string().uuid(),
});

const ROW_RESULT_TOOLS = new Set<string>([
    'runQuery',
    'runMetricQuery',
    'runSavedChart',
    'runContentQuery',
    'runSql',
    'runComposerQueries',
    'getDashboardCharts',
    'generateDashboard',
    'generateVisualization',
    'searchFieldValues',
    'readPinnedThread',
    'loadProjectContext',
]);

export const isSavedRowResult = (toolName: string): boolean =>
    ROW_RESULT_TOOLS.has(toolName);

export const savedResultHasAiSignInProvenance = (
    metadata: AiAgentToolResult['metadata'] | Record<string, unknown> | null,
    userUuid: string,
): string | null => {
    const parsed = aiSignInProvenanceSchema.safeParse(metadata);
    return parsed.success && parsed.data.aiSignInUserUuid === userUuid
        ? parsed.data.aiSignInCredentialUuid
        : null;
};

export const withholdSavedRows = async (
    toolName: string,
    result: string,
): Promise<string> => {
    if (toolName === 'searchFieldValues') {
        return '[field values withheld under AI access restrictions]';
    }
    const shaped = await shapeRowsInResult(result, false);
    const rowShape = shaped.match(/\[row shape: \{[^\n]+\}\]/)?.[0];
    return rowShape
        ? `${rowShape}\n[query rows withheld under AI access restrictions]`
        : '[query metadata: fields unavailable; row count unavailable]\n[query rows withheld under AI access restrictions]';
};
