import { type ToolCallSummary } from './types';

/** What a tool call reads that may be a live data source. */
export type LiveSourceToolTarget =
    | { kind: 'connection'; connectionUuid: string }
    | { kind: 'explore'; exploreName: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const getStringArg = (args: unknown, key: string): string | null =>
    isRecord(args) && typeof args[key] === 'string' ? args[key] : null;

/** The one explore every query node reads; null when nodes read different or no explores. */
const getQueriesExploreName = (args: unknown): string | null => {
    if (!isRecord(args) || !Array.isArray(args.queries)) {
        return null;
    }
    const exploreNames = new Set(
        args.queries.map((node: unknown) => getStringArg(node, 'exploreName')),
    );
    const [exploreName] = [...exploreNames];
    return exploreNames.size === 1 ? exploreName : null;
};

const getCallTarget = (
    toolCall: ToolCallSummary,
): LiveSourceToolTarget | null => {
    const { toolName, toolArgs } = toolCall;
    const connectionUuid =
        toolName === 'listLiveSourceFields'
            ? getStringArg(toolArgs, 'connectionUuid')
            : null;
    if (connectionUuid) {
        return { kind: 'connection', connectionUuid };
    }
    const exploreName =
        getStringArg(toolArgs, 'exploreName') ??
        getStringArg(toolArgs, 'table') ??
        (isRecord(toolArgs)
            ? getStringArg(toolArgs.source, 'tableName')
            : null) ??
        getQueriesExploreName(toolArgs);
    return exploreName ? { kind: 'explore', exploreName } : null;
};

const getTargetKey = (target: LiveSourceToolTarget | null): string | null => {
    if (!target) {
        return null;
    }
    return target.kind === 'connection'
        ? `connection:${target.connectionUuid}`
        : `explore:${target.exploreName}`;
};

/**
 * The connection or explore a row of tool calls reads, when every call reads
 * the same one. The row shows that live data source's icon when it is one.
 */
export const getLiveSourceToolTarget = (
    toolCalls: ToolCallSummary[],
): LiveSourceToolTarget | null => {
    const targets = toolCalls.map(getCallTarget);
    const keys = new Set(targets.map(getTargetKey));
    return keys.size === 1 ? (targets[0] ?? null) : null;
};
