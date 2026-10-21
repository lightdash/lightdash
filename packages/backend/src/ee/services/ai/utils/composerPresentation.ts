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

/** Resolves presentation markers against this prompt's successful composer
 * results: web `<show node>` by terminal node, Slack `<slack-table queryUuid>`
 * by execution. Anything else is ignored. */
export const resolveComposerPresentations = ({
    channel,
    response,
    promptUuid,
    toolResults,
}: {
    channel: 'web' | 'slack';
    response: string;
    promptUuid: string;
    toolResults: TurnToolResult[];
}): { presented: ToolComposerQueriesSuccessMetadata[]; response: string } => {
    const results = toolResults.flatMap((result) => {
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
    const present = (
        keys: string[],
        keyOf: (metadata: ToolComposerQueriesSuccessMetadata) => string,
    ) => {
        // Later calls win when two share a key.
        const byKey = new Map(results.map((m) => [keyOf(m), m] as const));
        return [...new Set(keys)].flatMap((key) => {
            const metadata = byKey.get(key);
            return metadata ? [metadata] : [];
        });
    };
    switch (channel) {
        case 'web': {
            const prose = response
                .split(FENCED_CODE_BLOCK_REGEX)
                .filter((_, index) => index % 2 === 0)
                .join('\n');
            return {
                presented: present(
                    [...prose.matchAll(SHOW_MARKER_REGEX)].map((m) => m[1]),
                    (metadata) => metadata.terminalNodeId,
                ),
                response: stripComposerPresentationMarkers(response),
            };
        }
        case 'slack':
            return {
                presented: present(
                    parseSlackVisualizationSelection(response).tableQueryUuids,
                    (metadata) => metadata.queryUuid,
                ),
                response: stripSlackVisualizationSelection(response),
            };
        default:
            return assertUnreachable(channel, 'Unknown presentation channel');
    }
};

/** One table artifact version per presented node: its closure over the
 * thread's nodes. */
export const buildComposerPresentations = ({
    presented,
    threadNodes,
}: {
    presented: ToolComposerQueriesSuccessMetadata[];
    threadNodes: ThreadComposerQueryNode[];
}): AiComposerArtifactVersion[] =>
    presented.flatMap((metadata) => {
        const node = threadNodes.find(
            ({ nodeId }) => nodeId === metadata.terminalNodeId,
        );
        if (!node) return [];
        return [
            toComposerArtifactVersion({
                title: metadata.title,
                description: metadata.description,
                queries: buildComposerArtifactPipeline({
                    queries: [node],
                    threadNodes,
                }),
                terminalNodeId: metadata.terminalNodeId,
                vizConfig: null,
            }),
        ];
    });
