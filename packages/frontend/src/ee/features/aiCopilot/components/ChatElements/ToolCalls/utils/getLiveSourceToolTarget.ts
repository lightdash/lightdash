import { QuerySourceType } from '@lightdash/common';
import { type ToolCallSummary } from './types';

/** What a tool call reads that may be a live data source. */
export type LiveSourceToolTarget =
    | { kind: 'connection'; connectionUuid: string }
    | { kind: 'explore'; exploreName: string };

/** A source a call reads; null for one that is never a live data source, such as warehouse SQL. */
type CallSource = LiveSourceToolTarget | null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const getStringArg = (args: unknown, key: string): string | null =>
    isRecord(args) && typeof args[key] === 'string' ? args[key] : null;

const getArrayArg = (args: unknown, key: string): unknown[] =>
    isRecord(args) && Array.isArray(args[key]) ? args[key] : [];

const explore = (exploreName: string | null): CallSource[] =>
    exploreName ? [{ kind: 'explore', exploreName }] : [];

/** Composer steps that only reshape other steps' rows read no source of their own. */
const getComposerNodeSources = (node: unknown): CallSource[] => {
    switch (getStringArg(node, 'sourceType')) {
        case QuerySourceType.SEMANTIC_LAYER:
            return explore(getStringArg(node, 'exploreName'));
        case QuerySourceType.API: {
            const connectionUuid = getStringArg(node, 'connectionUuid');
            return connectionUuid
                ? [{ kind: 'connection', connectionUuid }]
                : [];
        }
        case QuerySourceType.DUCKDB:
        case QuerySourceType.PYTHON:
            return [];
        default:
            return [null];
    }
};

/** runQuery and generateVisualization: the main query plus any merged one. */
const getRunQuerySources = (args: unknown): CallSource[] => [
    ...explore(
        getStringArg(isRecord(args) ? args.queryConfig : null, 'exploreName'),
    ),
    ...getArrayArg(
        isRecord(args) ? args.mergeConfig : null,
        'additionalSources',
    ).flatMap((source) =>
        explore(
            getStringArg(
                isRecord(source) ? source.queryConfig : null,
                'exploreName',
            ),
        ),
    ),
];

const getMetadataRequestSources = (request: unknown): CallSource[] =>
    getStringArg(request, 'type') === 'explore'
        ? getArrayArg(request, 'exploreIds').flatMap((exploreId) =>
              explore(typeof exploreId === 'string' ? exploreId : null),
          )
        : getArrayArg(request, 'fields').flatMap((field) =>
              explore(getStringArg(field, 'exploreId')),
          );

const getCallSources = ({
    toolName,
    toolArgs,
}: ToolCallSummary): CallSource[] => {
    switch (toolName) {
        case 'query':
        case 'runComposerQueries':
            return getArrayArg(toolArgs, 'queries').flatMap(
                getComposerNodeSources,
            );
        case 'runQuery':
        case 'generateVisualization':
            return getRunQuerySources(toolArgs);
        case 'getMetadata':
            return getArrayArg(toolArgs, 'requests').flatMap(
                getMetadataRequestSources,
            );
        case 'runContentQuery':
            return explore(
                getStringArg(
                    isRecord(toolArgs) ? toolArgs.source : null,
                    'tableName',
                ),
            );
        default:
            return explore(
                getStringArg(toolArgs, 'exploreName') ??
                    getStringArg(toolArgs, 'table') ??
                    getStringArg(
                        isRecord(toolArgs) ? toolArgs.vizConfig : null,
                        'exploreName',
                    ),
            );
    }
};

const getSourceKey = (source: CallSource): string | null => {
    if (!source) {
        return null;
    }
    return source.kind === 'connection'
        ? `connection:${source.connectionUuid}`
        : `explore:${source.exploreName}`;
};

/**
 * The connection or explore a row of tool calls reads, when every call reads
 * that one source and nothing else. The row shows that live data source's
 * icon when it is one.
 */
export const getLiveSourceToolTarget = (
    toolCalls: ToolCallSummary[],
): LiveSourceToolTarget | null => {
    const sourcesPerCall = toolCalls.map(getCallSources);
    if (
        sourcesPerCall.length === 0 ||
        sourcesPerCall.some((sources) => sources.length === 0)
    ) {
        return null;
    }
    const sources = sourcesPerCall.flat();
    const keys = new Set(sources.map(getSourceKey));
    return keys.size === 1 ? sources[0] : null;
};
