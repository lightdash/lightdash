import {
    assertUnreachable,
    buildComposerArtifactPipeline,
    parseToolComposerQueriesSuccessMetadata,
    runComposerQueriesToolDefinition,
    toComposerArtifactVersion,
    type AiComposerArtifactVersion,
    type ThreadComposerQueryNode,
    type ToolComposerQueriesSuccessMetadata,
} from '@lightdash/common';
import {
    parseSlackVisualizationSelection,
    stripSlackVisualizationSelection,
} from './slackVisualizationSelection';

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

/** What the final answer presents: web names nodes in the thread's
 * registry, Slack names executions of this prompt. */
export type ComposerPresentationSelection =
    | { channel: 'web'; nodeIds: string[] }
    | { channel: 'slack'; results: ToolComposerQueriesSuccessMetadata[] };

const unique = (keys: string[]) => [...new Set(keys)];

const thisPromptComposerResults = (
    promptUuid: string,
    toolResults: TurnToolResult[],
): ToolComposerQueriesSuccessMetadata[] =>
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
        return metadata ? [metadata] : [];
    });

/** Reads presentation markers and strips them from the answer: web
 * `<show node>` by node id, Slack `<slack-table queryUuid>` by this prompt's
 * successful composer executions. */
export const resolveComposerPresentations = (
    input:
        | { channel: 'web'; response: string }
        | {
              channel: 'slack';
              response: string;
              promptUuid: string;
              toolResults: TurnToolResult[];
          },
): { presented: ComposerPresentationSelection; response: string } => {
    switch (input.channel) {
        case 'web': {
            const prose = input.response
                .split(FENCED_CODE_BLOCK_REGEX)
                .filter((_, index) => index % 2 === 0)
                .join('\n');
            return {
                presented: {
                    channel: 'web',
                    nodeIds: unique(
                        [...prose.matchAll(SHOW_MARKER_REGEX)].map((m) => m[1]),
                    ),
                },
                response: stripComposerPresentationMarkers(input.response),
            };
        }
        case 'slack': {
            // Later calls win when two share an execution.
            const byQueryUuid = new Map(
                thisPromptComposerResults(
                    input.promptUuid,
                    input.toolResults,
                ).map((metadata) => [metadata.queryUuid, metadata] as const),
            );
            return {
                presented: {
                    channel: 'slack',
                    results: unique(
                        parseSlackVisualizationSelection(input.response)
                            .tableQueryUuids,
                    ).flatMap((queryUuid) => {
                        const metadata = byQueryUuid.get(queryUuid);
                        return metadata ? [metadata] : [];
                    }),
                },
                response: stripSlackVisualizationSelection(input.response),
            };
        }
        default:
            return assertUnreachable(input, 'Unknown presentation channel');
    }
};

export const hasComposerPresentations = (
    presented: ComposerPresentationSelection,
): boolean => {
    switch (presented.channel) {
        case 'web':
            return presented.nodeIds.length > 0;
        case 'slack':
            return presented.results.length > 0;
        default:
            return assertUnreachable(presented, 'Unknown presentation channel');
    }
};

/** One table artifact version per presented node found in the thread's
 * registry: its closure over the thread's nodes. */
export const buildComposerPresentations = ({
    presented,
    threadNodes,
}: {
    presented: ComposerPresentationSelection;
    threadNodes: ThreadComposerQueryNode[];
}): AiComposerArtifactVersion[] => {
    const byNodeId = new Map(threadNodes.map((node) => [node.nodeId, node]));
    const toVersion = (
        nodeId: string,
        label: (node: ThreadComposerQueryNode) => {
            title: string;
            description: string | null;
        },
    ): AiComposerArtifactVersion[] => {
        const node = byNodeId.get(nodeId);
        if (!node) return [];
        return [
            toComposerArtifactVersion({
                ...label(node),
                queries: buildComposerArtifactPipeline({
                    queries: [node],
                    threadNodes,
                }),
                terminalNodeId: nodeId,
                vizConfig: null,
            }),
        ];
    };
    switch (presented.channel) {
        case 'web':
            return presented.nodeIds.flatMap((nodeId) =>
                toVersion(nodeId, (node) => ({
                    title: node.title ?? node.nodeId,
                    description: node.description ?? null,
                })),
            );
        case 'slack':
            return presented.results.flatMap((metadata) =>
                toVersion(metadata.terminalNodeId, () => ({
                    title: metadata.title,
                    description: metadata.description,
                })),
            );
        default:
            return assertUnreachable(presented, 'Unknown presentation channel');
    }
};
