import {
    DBT_SAVE_CARD_REPLY,
    endsTurnOnCard,
    getRunProposals,
    getStudioCardReply,
    hasMoreToDo,
    isDbtWriteToolName,
} from '@lightdash/common';
import { type AgentTurnStep, type TurnCard } from '../ai/types/aiAgent';
import { isErrorToolResult } from '../ai/utils/toolSummaries';

/** A Studio turn that ends on its card with nothing written keeps one line saying what changed, so the reply is never blank. */
export const withStudioCardReply = (
    reply: string,
    steps: ReadonlyArray<AgentTurnStep>,
): string => {
    if (reply.trim()) return reply;
    return (
        getStudioCardReply(
            getRunProposals(steps.flatMap((step) => step.toolResults)),
        ) ?? reply
    );
};

/** A Studio turn ends on its card: once a change joined the draft cleanly, or a save started, there is nothing left to say. */
export const getStudioCardResponse = (
    steps: ReadonlyArray<AgentTurnStep>,
): string | null => {
    const last = steps.at(-1);
    if (!last) return null;
    const proposals = getRunProposals(last.toolResults);
    if (proposals.length > 0) {
        return endsTurnOnCard(proposals) ? getStudioCardReply(proposals) : null;
    }
    const studioSaves = new Set(
        last.toolCalls
            .filter(
                ({ toolName, input }) =>
                    isDbtWriteToolName(toolName) && !hasMoreToDo(input),
            )
            .map(({ toolCallId }) => toolCallId),
    );
    const isSaving = last.toolResults.some(
        ({ toolCallId, output }) =>
            studioSaves.has(toolCallId) && !isErrorToolResult(output),
    );
    return isSaving ? DBT_SAVE_CARD_REPLY : null;
};

export const studioTurnCard: TurnCard = {
    getResponse: getStudioCardResponse,
    withReply: withStudioCardReply,
};
