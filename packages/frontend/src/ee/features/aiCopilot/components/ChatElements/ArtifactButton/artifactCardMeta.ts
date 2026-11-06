import {
    type AiAgentJevDecision,
    type UiStringResolver,
} from '@lightdash/common';
import { type ArtifactType } from './pendingArtifact';

const EDIT_OUTCOMES: ReadonlySet<AiAgentJevDecision['outcome']> = new Set([
    'intent',
    'compound',
    'needs_values',
]);

// Threads reuse one artifact for unrelated charts, so only a turn the decision
// model resolved as an edit of the active chart counts as a revision.
export const isArtifactRevision = ({
    versionNumber,
    jevDecision,
}: {
    versionNumber: number;
    jevDecision: AiAgentJevDecision | null;
}): boolean =>
    versionNumber > 1 &&
    jevDecision !== null &&
    EDIT_OUTCOMES.has(jevDecision.outcome);

export const getArtifactTypeLabel = (
    artifactType: ArtifactType,
    getUiString: UiStringResolver,
): string =>
    getUiString(
        artifactType === 'dashboard'
            ? 'aiAgent.artifact.type.dashboard'
            : 'aiAgent.artifact.type.chart',
    );
