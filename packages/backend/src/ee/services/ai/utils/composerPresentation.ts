import {
    parseToolComposerQueriesSuccessMetadata,
    type AiComposerChartArtifactConfig,
    type ToolComposerQueriesSuccessMetadata,
} from '@lightdash/common';

const SHOW_MARKER_REGEX = /<show\s+node\s*=\s*"([^"<>\s]+)"\s*\/?>/g;
const SHOW_TAG_REGEX = / ?<\/?show\b[^>]*(?:>|$)/gi;
const FENCED_CODE_BLOCK_REGEX = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;

export type ComposerToolResult = {
    promptUuid: string;
    toolName: string;
    metadata: unknown;
};

export type ComposerPresentation = {
    title: string;
    description: string | null;
    config: AiComposerChartArtifactConfig;
};

export const stripComposerPresentationMarkers = (response: string): string =>
    response
        .replace(SHOW_TAG_REGEX, '')
        .replace(/\n(?:[ \t]*\n){2,}/g, '\n\n')
        .trim();

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
    const prose = response.replace(FENCED_CODE_BLOCK_REGEX, '');
    const nodeIds = [
        ...new Set([...prose.matchAll(SHOW_MARKER_REGEX)].map((m) => m[1])),
    ];
    return {
        presentations: nodeIds.flatMap((nodeId) => {
            const metadata = presentable.get(nodeId);
            return metadata
                ? [
                      {
                          title: metadata.title,
                          description: metadata.description,
                          config: {
                              source: 'composer',
                              schemaVersion: 1,
                              queries: metadata.snapshot,
                              terminalNodeId: metadata.terminalNodeId,
                              vizConfig: metadata.vizConfig,
                          },
                      },
                  ]
                : [];
        }),
        response: stripComposerPresentationMarkers(response),
    };
};
