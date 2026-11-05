import { type AiAgentMessageAssistant } from '@lightdash/common';
import { type StreamPart } from '../../../store/aiAgentThreadStreamSlice';

export type ArtifactType = NonNullable<
    AiAgentMessageAssistant['artifacts']
>[number]['artifactType'];

// Tools whose successful run always lands an artifact card in the web chat.
const ARTIFACT_TOOL_TYPES: Partial<Record<string, ArtifactType>> = {
    visualize: 'chart',
    runQuery: 'chart',
    generateVisualization: 'chart',
    generateDashboard: 'dashboard',
};

/** The artifact an in-flight tool call is building, until the turn's first artifact lands. */
export const getPendingArtifactType = (
    parts: readonly StreamPart[],
    hasArtifacts: boolean,
): ArtifactType | null => {
    if (hasArtifacts) return null;
    for (const part of parts) {
        if (part.type !== 'toolCall') continue;
        const inFlight =
            (part.toolResult ?? null) === null || part.isPreliminary === true;
        const artifactType = ARTIFACT_TOOL_TYPES[part.toolName];
        if (inFlight && artifactType) return artifactType;
    }
    return null;
};
