import {
    parseToolComposerQueriesSuccessMetadata,
    toComposerArtifactVersion,
    type AiComposerArtifactVersion,
    type ToolComposerQueriesSuccessMetadata,
} from '@lightdash/common';

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

export type ComposerToolResult = {
    promptUuid: string;
    toolName: string;
    metadata: unknown;
};

export type ComposerPresentation = AiComposerArtifactVersion;

export const stripComposerPresentationMarkers = (response: string): string =>
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
    toolResults: ComposerToolResult[];
}): { presentations: ComposerPresentation[]; response: string } => {
    // Later calls win when two calls end at the same node.
    const presentable = new Map<string, ToolComposerQueriesSuccessMetadata>(
        toolResults.flatMap((result) => {
            if (
                result.promptUuid !== promptUuid ||
                result.toolName !== 'runComposerQueries'
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
        presentations: nodeIds.flatMap((nodeId) => {
            const metadata = presentable.get(nodeId);
            return metadata
                ? [
                      toComposerArtifactVersion({
                          title: metadata.title,
                          description: metadata.description,
                          queries: metadata.snapshot,
                          terminalNodeId: metadata.terminalNodeId,
                          vizConfig: metadata.vizConfig,
                      }),
                  ]
                : [];
        }),
        response: stripComposerPresentationMarkers(response),
    };
};
