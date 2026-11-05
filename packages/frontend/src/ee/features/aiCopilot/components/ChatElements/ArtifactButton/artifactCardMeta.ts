import {
    type AiAgentJevDecision,
    type UiStringResolver,
} from '@lightdash/common';
import { type ArtifactType } from './pendingArtifact';

type ArtifactCardMetaInput = {
    artifactType: ArtifactType;
    isRevision: boolean;
    isArtifactOpen: boolean;
    /** The result has landed but the agent is still writing its reply. */
    isTurnFinishing: boolean;
};

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

export const getArtifactCardMeta = (
    {
        artifactType,
        isRevision,
        isArtifactOpen,
        isTurnFinishing,
    }: ArtifactCardMetaInput,
    getUiString: UiStringResolver,
): string => {
    // While the reply is still being written, the turn's own status line speaks.
    const state = isTurnFinishing
        ? null
        : getUiString(
              isArtifactOpen
                  ? 'aiAgent.artifact.shownInPanel'
                  : 'aiAgent.artifact.readyToView',
          );
    return [
        getArtifactTypeLabel(artifactType, getUiString),
        isRevision ? getUiString('aiAgent.artifactPanel.edited') : null,
        state,
    ]
        .filter((part): part is string => part !== null)
        .join(' · ');
};
