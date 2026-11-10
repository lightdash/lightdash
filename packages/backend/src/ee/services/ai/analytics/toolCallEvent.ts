import {
    aiToolErrorCodeSchema,
    FilterOperator,
    isComposerQueryToolName,
    parseFilterExpression,
    pythonExceptionTypeSchema,
    QuerySourceType,
    type AiToolErrorCode,
    type AiToolErrorDetails,
} from '@lightdash/common';
import { z } from 'zod';
import Logger from '../../../../logging/logger';
import { MCP_TRUNCATION_MARKER } from '../AiAgentMcpRuntimeClient';
import { getAiToolErrorDetails } from '../utils/aiToolErrorCode';
import { isErrorToolResult } from '../utils/toolSummaries';
import {
    opaqueIdField,
    uuidField,
    versionField,
    type IsMetadataOnly,
} from './metadataOnly';

export const toolCallOutcomeSchema = z.enum(['ok', 'error', 'empty']);
export type ToolCallOutcome = z.infer<typeof toolCallOutcomeSchema>;

const nodeCount = z.number().int().nonnegative().nullable();

export const aiAgentToolCallCompletedPropertiesSchema = z
    .object({
        organizationId: uuidField,
        projectId: uuidField,
        aiAgentId: uuidField,
        threadId: uuidField,
        promptId: uuidField,
        toolCallId: opaqueIdField,
        toolName: opaqueIdField,
        model: opaqueIdField,
        serverVersion: versionField,
        stepIndex: z.number().int().nonnegative(),
        durationMs: z.number().nonnegative(),
        stage: z.enum(['query', 'api', 'render']),
        queryCacheHit: z.boolean().nullable(),
        queryReuseHit: z.boolean().nullable(),
        status: z.enum(['success', 'error']),
        outcome: toolCallOutcomeSchema,
        errorCode: aiToolErrorCodeSchema.nullable(),
        pythonExceptionType: pythonExceptionTypeSchema.nullable(),
        rowCount: z.number().int().nonnegative().nullable(),
        truncated: z.boolean().nullable(),
        attempt: z.number().int().positive(),
        composerSemanticLayerNodes: nodeCount,
        composerSqlNodes: nodeCount,
        composerDuckdbNodes: nodeCount,
        composerPythonNodes: nodeCount,
        composerExternalNodes: nodeCount,
        composerApiNodes: nodeCount,
        filterOperators: z.array(z.enum(FilterOperator)),
        detour: z.boolean(),
    })
    .strict();

export type AiAgentToolCallCompletedProperties = z.output<
    typeof aiAgentToolCallCompletedPropertiesSchema
>;

export const toolCallPayloadIsMetadataOnly: IsMetadataOnly<AiAgentToolCallCompletedProperties> = true;

export type ToolCallResult =
    | { type: 'tool-result'; output: unknown }
    | { type: 'tool-error'; error: unknown };

type OutputSummary = {
    outcome: ToolCallOutcome;
    error: AiToolErrorDetails | null;
    rowCount: number | null;
    truncated: boolean | null;
};

const toolErrorMetadataSchema = z.object({
    code: aiToolErrorCodeSchema,
    pythonExceptionType: pythonExceptionTypeSchema.nullable(),
});

const toolOutputShapeSchema = z.object({
    metadata: z
        .object({
            status: z.unknown(),
            rowCount: z.unknown(),
            truncated: z.unknown(),
            toolError: z.unknown(),
        })
        .partial()
        .nullish(),
    structuredContent: z
        .object({
            rowCount: z.unknown(),
            truncated: z.unknown(),
            preview: z.object({ truncated: z.unknown() }).partial().nullish(),
        })
        .partial()
        .nullish(),
});

const mcpOutputShapeSchema = z.object({
    content: z.array(z.unknown()),
    isError: z.boolean().optional(),
});

const mcpContentBlockSchema = z.object({
    type: z.string(),
    text: z.unknown().optional(),
});

// Non-success statuses tools return without a toolError
const NON_SUCCESS_STATUS_CODES: Partial<Record<string, AiToolErrorCode>> = {
    rejected: 'sql_rejected',
    timeout: 'sql_approval_timeout',
};

const UNKNOWN_ERROR: AiToolErrorDetails = {
    code: 'unknown',
    pythonExceptionType: null,
};

const asRowCount = (value: unknown): number | null =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0
        ? value
        : null;
const asBoolean = (value: unknown): boolean | null =>
    typeof value === 'boolean' ? value : null;

const summarizeMcpOutput = (
    output: z.infer<typeof mcpOutputShapeSchema>,
): OutputSummary => {
    if (output.isError === true)
        return {
            outcome: 'error',
            error: UNKNOWN_ERROR,
            rowCount: null,
            truncated: null,
        };
    const truncated = JSON.stringify(output.content).includes(
        MCP_TRUNCATION_MARKER,
    );
    // Item 0 is our untrusted-output notice; images and resources count as content
    const hasContent = output.content.some((item, index) => {
        if (index === 0) return false;
        const block = mcpContentBlockSchema.safeParse(item);
        if (!block.success) return false;
        return (
            block.data.type !== 'text' ||
            (typeof block.data.text === 'string' &&
                block.data.text.trim().length > 0)
        );
    });
    return {
        outcome: truncated || !hasContent ? 'empty' : 'ok',
        error: null,
        rowCount: null,
        truncated,
    };
};

/** Reads only status, counts and codes from a tool's output; never its text. */
export const summarizeToolCallResult = (
    result: ToolCallResult,
): OutputSummary => {
    if (result.type === 'tool-error')
        return {
            outcome: 'error',
            error: getAiToolErrorDetails(result.error),
            rowCount: null,
            truncated: null,
        };
    const mcp = mcpOutputShapeSchema.safeParse(result.output);
    if (mcp.success) return summarizeMcpOutput(mcp.data);
    const parsed = toolOutputShapeSchema.safeParse(result.output);
    const { metadata, structuredContent } = parsed.success
        ? parsed.data
        : { metadata: null, structuredContent: null };
    const rowCount =
        asRowCount(metadata?.rowCount) ??
        asRowCount(structuredContent?.rowCount);
    const truncated =
        asBoolean(metadata?.truncated) ??
        asBoolean(structuredContent?.truncated) ??
        asBoolean(structuredContent?.preview?.truncated);
    const statusCode =
        typeof metadata?.status === 'string'
            ? NON_SUCCESS_STATUS_CODES[metadata.status]
            : undefined;
    if (metadata?.status === 'error' || statusCode !== undefined) {
        const toolError = toolErrorMetadataSchema.safeParse(
            metadata?.toolError,
        );
        const fallback: AiToolErrorDetails = statusCode
            ? { code: statusCode, pythonExceptionType: null }
            : UNKNOWN_ERROR;
        return {
            outcome: 'error',
            error: toolError.success ? toolError.data : fallback,
            rowCount,
            truncated,
        };
    }
    return {
        outcome: rowCount === 0 ? 'empty' : 'ok',
        error: null,
        rowCount,
        truncated,
    };
};

const filterOperatorSchema = z.enum(FilterOperator);

// Expression strings, or structured rule arrays, per category
const filterCategorySchema = z
    .union([z.string(), z.array(z.object({ operator: z.unknown() }).partial())])
    .nullish();

const filterCategoriesSchema = z
    .object({
        dimensions: filterCategorySchema,
        metrics: filterCategorySchema,
        tableCalculations: filterCategorySchema,
    })
    .partial();

const toolInputShapeSchema = z
    .object({
        filters: z.unknown(),
        queryConfig: z.object({ filters: z.unknown() }).partial(),
        queries: z.array(
            z
                .object({ sourceType: z.unknown(), filters: z.unknown() })
                .partial(),
        ),
        target: z.unknown(),
        command: z.unknown(),
    })
    .partial();

const getExpressionOperators = (expression: string): FilterOperator[] => {
    const result = parseFilterExpression(expression);
    return result.success
        ? result.expression.rules.map((rule) => rule.operator.value)
        : [];
};

const LIGHTDASH_REPO = 'lightdash/lightdash';

/** Calls that leave the user's data to read our own code, docs or tool catalog. */
const isDetour = (
    toolName: string,
    input: z.infer<typeof toolInputShapeSchema>,
): boolean => {
    if (toolName === 'loadMcpTools') return true;
    if (toolName === 'exploreRepo')
        return (
            (typeof input.target === 'string' &&
                input.target.toLowerCase() === LIGHTDASH_REPO) ||
            (typeof input.command === 'string' &&
                input.command.toLowerCase().includes(`/${LIGHTDASH_REPO}`))
        );
    const name = toolName.toLowerCase();
    return (
        name.startsWith('mcp_') &&
        name.includes('doc') &&
        name.includes('search')
    );
};

const getFilterOperators = (filters: unknown): FilterOperator[] => {
    if (typeof filters === 'string') return getExpressionOperators(filters);
    const parsed = filterCategoriesSchema.safeParse(filters);
    if (!parsed.success) return [];
    return Object.values(parsed.data).flatMap((category) => {
        if (typeof category === 'string')
            return getExpressionOperators(category);
        return (category ?? []).flatMap((rule) => {
            const operator = filterOperatorSchema.safeParse(rule.operator);
            return operator.success ? [operator.data] : [];
        });
    });
};

type InputSummary = Pick<
    AiAgentToolCallCompletedProperties,
    | 'composerSemanticLayerNodes'
    | 'composerSqlNodes'
    | 'composerDuckdbNodes'
    | 'composerPythonNodes'
    | 'composerExternalNodes'
    | 'composerApiNodes'
    | 'filterOperators'
    | 'detour'
>;

/** Counts node source types and filter operator enums; field names, values and code are never read out. */
export const summarizeToolCallInput = (
    toolName: string,
    input: unknown,
): InputSummary => {
    const parsed = toolInputShapeSchema.safeParse(input);
    const shape = parsed.success ? parsed.data : {};
    const { filters, queryConfig, queries } = shape;
    const nodes = isComposerQueryToolName(toolName) ? (queries ?? []) : null;
    const countNodes = (sourceType: QuerySourceType) =>
        nodes === null
            ? null
            : nodes.filter((node) => node.sourceType === sourceType).length;
    const operators = new Set([
        ...getFilterOperators(filters),
        ...getFilterOperators(queryConfig?.filters),
        ...(queries ?? []).flatMap((node) => getFilterOperators(node.filters)),
    ]);
    return {
        composerSemanticLayerNodes: countNodes(QuerySourceType.SEMANTIC_LAYER),
        composerSqlNodes: countNodes(QuerySourceType.SQL),
        composerDuckdbNodes: countNodes(QuerySourceType.DUCKDB),
        composerPythonNodes: countNodes(QuerySourceType.PYTHON),
        composerExternalNodes: countNodes(QuerySourceType.EXTERNAL),
        composerApiNodes: countNodes(QuerySourceType.API),
        filterOperators: [...operators].sort(),
        detour: isDetour(toolName, shape),
    };
};

export type ToolCallEventContext = {
    organizationId: string;
    projectId: string;
    aiAgentId: string;
    threadId: string;
    promptId: string;
    model: string;
    serverVersion: string;
};

export type ToolCallEventInput = {
    toolCallId: string;
    toolName: string;
    input: unknown;
    result: ToolCallResult;
    stepIndex: number;
    durationMs: number;
    stage: 'query' | 'api' | 'render';
    queryCacheHit: boolean | null;
    queryReuseHit: boolean | null;
    attempt: number;
};

/** Builds the event payload; null when any field fails the metadata-only schema. */
export const buildToolCallCompletedProperties = (
    context: ToolCallEventContext,
    call: ToolCallEventInput,
): AiAgentToolCallCompletedProperties | null => {
    const output = summarizeToolCallResult(call.result);
    const parsed = aiAgentToolCallCompletedPropertiesSchema.safeParse({
        ...context,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        stepIndex: call.stepIndex,
        durationMs: call.durationMs,
        stage: call.stage,
        queryCacheHit: call.queryCacheHit,
        queryReuseHit: call.queryReuseHit,
        status:
            call.result.type === 'tool-error' ||
            isErrorToolResult(call.result.output)
                ? 'error'
                : 'success',
        outcome: output.outcome,
        errorCode: output.error?.code ?? null,
        pythonExceptionType: output.error?.pythonExceptionType ?? null,
        rowCount: output.rowCount,
        truncated: output.truncated,
        attempt: call.attempt,
        ...summarizeToolCallInput(call.toolName, call.input),
    } satisfies Record<keyof AiAgentToolCallCompletedProperties, unknown>);
    if (parsed.success) return parsed.data;
    Logger.warn(
        `[AiAgent] Dropped tool call event; invalid fields: ${parsed.error.issues
            .map((issue) => issue.path.join('.'))
            .join(', ')}`,
    );
    return null;
};

/** One per turn: numbers each tool's attempts and keeps the payloads for the turn's outcome. */
export const createToolCallEventTracker = (
    context: ToolCallEventContext,
    emit: (properties: AiAgentToolCallCompletedProperties) => void,
) => {
    const attemptsByTool = new Map<string, number>();
    const attemptsByCall = new Map<string, number>();
    const tracked = new Set<string>();
    const calls: AiAgentToolCallCompletedProperties[] = [];
    // Numbered when the call starts, so concurrent calls finishing out of order keep their order
    const assignAttempt = (toolCallId: string, toolName: string): number => {
        const assigned = attemptsByCall.get(toolCallId);
        if (assigned !== undefined) return assigned;
        const attempt = (attemptsByTool.get(toolName) ?? 0) + 1;
        attemptsByTool.set(toolName, attempt);
        attemptsByCall.set(toolCallId, attempt);
        return attempt;
    };
    return {
        start: (toolCallId: string, toolName: string) => {
            assignAttempt(toolCallId, toolName);
        },
        track: (call: Omit<ToolCallEventInput, 'attempt'>) => {
            if (tracked.has(call.toolCallId)) return;
            tracked.add(call.toolCallId);
            const properties = buildToolCallCompletedProperties(context, {
                ...call,
                attempt: assignAttempt(call.toolCallId, call.toolName),
            });
            if (properties === null) return;
            calls.push(properties);
            emit(properties);
        },
        isTracked: (toolCallId: string): boolean => tracked.has(toolCallId),
        calls: (): readonly AiAgentToolCallCompletedProperties[] => calls,
    };
};

export type ToolCallEventTracker = ReturnType<
    typeof createToolCallEventTracker
>;
