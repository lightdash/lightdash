import {
    buildComposerArtifactPipeline,
    parseToolComposerQueriesSuccessMetadata,
    runComposerQueriesToolDefinition,
    toComposerArtifactVersion,
    type AiComposerArtifactVersion,
    type AllVizChartConfig,
    type AnyType,
    type ResultColumns,
    type ThreadComposerQueryNode,
    type ToolComposerQueriesSuccessMetadata,
} from '@lightdash/common';
import Logger from '../../../../logging/logger';
import { type PlanComposerViz } from '../decisions/vizPlanner';

const SHOW_MARKER_REGEX =
    /<show[ \t]+node[ \t]*=[ \t]*"([^"<>\s]+)"[ \t]*\/?>/g;
const SHOW_MARKER_STRIP_REGEX =
    /[ \t]?<show[ \t]+node[ \t]*=[ \t]*"[^"<>\s]+"[ \t]*\/?>/g;
// An unclosed fence runs to the end, as in markdown.
const FENCED_CODE_BLOCK_REGEX = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$))/;

const mapProse = (text: string, fn: (prose: string) => string): string =>
    text
        .split(FENCED_CODE_BLOCK_REGEX)
        // split with a capture group puts fenced blocks at odd indexes
        .map((segment, index) => (index % 2 === 0 ? fn(segment) : segment))
        .join('');

export type TurnToolResult = {
    promptUuid: string;
    toolName: string;
    metadata: unknown;
};

const stripComposerPresentationMarkers = (response: string): string =>
    mapProse(response, (prose) =>
        prose
            .replace(SHOW_MARKER_STRIP_REGEX, '')
            .replace(/\n(?:[ \t]*\n){2,}/g, '\n\n'),
    ).trim();

/** Resolves `<show node="..."/>` markers against this prompt's successful
 * composer terminal nodes; anything else is ignored. */
export const resolveComposerPresentations = ({
    response,
    promptUuid,
    toolResults,
}: {
    response: string;
    promptUuid: string;
    toolResults: TurnToolResult[];
}): { presented: ToolComposerQueriesSuccessMetadata[]; response: string } => {
    // Later calls win when two calls end at the same node.
    const presentable = new Map<string, ToolComposerQueriesSuccessMetadata>(
        toolResults.flatMap((result) => {
            if (
                result.promptUuid !== promptUuid ||
                result.toolName !== runComposerQueriesToolDefinition.name
            ) {
                return [];
            }
            const metadata = parseToolComposerQueriesSuccessMetadata(
                result.metadata,
            );
            return metadata
                ? [[metadata.terminalNodeId, metadata] as const]
                : [];
        }),
    );
    const prose = response
        .split(FENCED_CODE_BLOCK_REGEX)
        .filter((_, index) => index % 2 === 0)
        .join('\n');
    const nodeIds = [
        ...new Set([...prose.matchAll(SHOW_MARKER_REGEX)].map((m) => m[1])),
    ];
    return {
        presented: nodeIds.flatMap((nodeId) => {
            const metadata = presentable.get(nodeId);
            return metadata ? [metadata] : [];
        }),
        response: stripComposerPresentationMarkers(response),
    };
};

export type ComposerExecutionResult = {
    columns: ResultColumns;
    rows: Record<string, AnyType>[];
    rowCount: number;
};

/** One artifact version per presented node: its closure over the thread's
 * nodes, plus a viz config when a planner is given (web only). */
export const buildComposerPresentations = async ({
    presented,
    threadNodes,
    planViz: planner,
    getExecutionResult,
    previousVizConfig,
    enableDataAccess,
}: {
    presented: ToolComposerQueriesSuccessMetadata[];
    threadNodes: ThreadComposerQueryNode[];
    planViz: PlanComposerViz | null;
    getExecutionResult: (queryUuid: string) => Promise<ComposerExecutionResult>;
    previousVizConfig: AllVizChartConfig | null;
    enableDataAccess: boolean;
}): Promise<AiComposerArtifactVersion[]> => {
    const planViz = async (
        metadata: ToolComposerQueriesSuccessMetadata,
        node: ThreadComposerQueryNode,
        previous: AllVizChartConfig | null,
    ): Promise<AllVizChartConfig | null> => {
        if (!planner) return null;
        try {
            return await planner({
                title: metadata.title,
                description: metadata.description,
                terminalNode: {
                    title: node.title ?? null,
                    description: node.description ?? null,
                },
                ...(await getExecutionResult(metadata.queryUuid)),
                enableDataAccess,
                previousVizConfig: previous,
            });
        } catch (error) {
            // The version is still saved; it opens as a table.
            Logger.error(
                `Composer presentation could not plan a viz for node ${metadata.terminalNodeId} (query ${metadata.queryUuid}): ${String(error)}`,
                error,
            );
            return null;
        }
    };
    // Sequential so each plan starts from the one before it.
    const { presentations } = await presented.reduce<
        Promise<{
            presentations: AiComposerArtifactVersion[];
            previous: AllVizChartConfig | null;
        }>
    >(
        (accumulator, metadata) =>
            accumulator.then(async (acc) => {
                const node = threadNodes.find(
                    ({ nodeId }) => nodeId === metadata.terminalNodeId,
                );
                if (!node) return acc;
                const vizConfig = await planViz(metadata, node, acc.previous);
                return {
                    presentations: [
                        ...acc.presentations,
                        toComposerArtifactVersion({
                            title: metadata.title,
                            description: metadata.description,
                            queries: buildComposerArtifactPipeline({
                                queries: [node],
                                threadNodes,
                            }),
                            terminalNodeId: metadata.terminalNodeId,
                            vizConfig,
                        }),
                    ],
                    previous: vizConfig ?? acc.previous,
                };
            }),
        Promise.resolve({ presentations: [], previous: previousVizConfig }),
    );
    return presentations;
};
