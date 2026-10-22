import {
    buildComposerArtifactPipeline,
    isComposerQueryToolName,
    parseToolComposerQueriesSuccessMetadata,
    toComposerArtifactVersion,
    type AiComposerArtifactVersion,
    type ThreadComposerQueryNode,
    type ToolComposerQueriesSuccessMetadata,
} from '@lightdash/common';
import {
    parseSlackVisualizationSelection,
    stripSlackVisualizationSelection,
} from './slackVisualizationSelection';

export type TurnToolResult = {
    promptUuid: string;
    toolName: string;
    metadata: unknown;
};

const unique = (keys: string[]) => [...new Set(keys)];

const thisPromptComposerResults = (
    promptUuid: string,
    toolResults: TurnToolResult[],
): ToolComposerQueriesSuccessMetadata[] =>
    toolResults.flatMap((result) => {
        if (
            result.promptUuid !== promptUuid ||
            !isComposerQueryToolName(result.toolName)
        ) {
            return [];
        }
        const metadata = parseToolComposerQueriesSuccessMetadata(
            result.metadata,
        );
        return metadata ? [metadata] : [];
    });

/** Reads Slack `<slack-table queryUuid>` markers naming this prompt's
 * successful composer executions, and strips them from the answer. */
export const resolveSlackComposerPresentations = ({
    response,
    promptUuid,
    toolResults,
}: {
    response: string;
    promptUuid: string;
    toolResults: TurnToolResult[];
}): { results: ToolComposerQueriesSuccessMetadata[]; response: string } => {
    // Later calls win when two share an execution.
    const byQueryUuid = new Map(
        thisPromptComposerResults(promptUuid, toolResults).map(
            (metadata) => [metadata.queryUuid, metadata] as const,
        ),
    );
    return {
        results: unique(
            parseSlackVisualizationSelection(response).tableQueryUuids,
        ).flatMap((queryUuid) => {
            const metadata = byQueryUuid.get(queryUuid);
            return metadata ? [metadata] : [];
        }),
        response: stripSlackVisualizationSelection(response),
    };
};

/** One table artifact version per presented result whose terminal node is in
 * the thread's registry: its closure over the thread's nodes. */
export const buildComposerPresentations = ({
    results,
    threadNodes,
}: {
    results: ToolComposerQueriesSuccessMetadata[];
    threadNodes: ThreadComposerQueryNode[];
}): AiComposerArtifactVersion[] => {
    const byNodeId = new Map(threadNodes.map((node) => [node.nodeId, node]));
    return results.flatMap((metadata) => {
        const node = byNodeId.get(metadata.terminalNodeId);
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
};
