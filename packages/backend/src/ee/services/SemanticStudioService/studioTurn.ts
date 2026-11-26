import { type SemanticLayerStatus } from '@lightdash/common';
import { type AgentTurnSetup } from '../ai/types/agentTurnSetup';
import { type StudioProjectMode } from '../ai/types/aiAgent';
import { worksAsDbtPullRequests } from './studioProject';
import { studioTurnCard } from './studioTurnCard';

export const getStudioProjectMode = async (
    status: SemanticLayerStatus,
    getDbtProjectMap: () => Promise<string | null>,
): Promise<StudioProjectMode> => {
    const worksAsDbt = worksAsDbtPullRequests(status);
    const drafts = status.enabled && !worksAsDbt;
    return {
        enabled: status.enabled,
        drafts,
        keepsContext: drafts && status.appliesAs === 'live',
        projectMap: worksAsDbt ? await getDbtProjectMap() : null,
    };
};

/** A Studio turn only edits models: it runs SQL unasked, takes no MCP tools, and offers each change as a choice on a card. */
export const getStudioTurnSetup = (
    studio: StudioProjectMode,
): AgentTurnSetup => ({
    studio,
    turnCard: studioTurnCard,
    autoApproveSql: true,
    usesFastDecisions: false,
    waitsOnMcpServers: false,
    asksWithoutFlag: true,
});
