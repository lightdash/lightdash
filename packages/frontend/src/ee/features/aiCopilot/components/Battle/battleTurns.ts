import { type AiAgentThread } from '@lightdash/common';
import { getResponseTimingMetrics } from '../../utils/responseTiming';

type BattleTurn = {
    uuid: string;
    totalMs: number | null;
    agentTokens: number;
    jevTokens: number;
};

export const getBattleTurns = (thread: AiAgentThread): BattleTurn[] =>
    thread.messages.flatMap((message) => {
        if (message.role !== 'assistant') return [];
        const timing = message.responseTiming
            ? getResponseTimingMetrics(message.responseTiming)
            : null;
        return [
            {
                uuid: message.uuid,
                totalMs:
                    message.status === 'pending'
                        ? null
                        : (timing?.totalMs ?? null),
                agentTokens: message.tokenUsage?.totalTokens ?? 0,
                jevTokens:
                    (message.tokenUsage?.decisionInputTokens ?? 0) +
                    (message.tokenUsage?.decisionOutputTokens ?? 0),
            },
        ];
    });

type BattleTotals = {
    totalMs: number;
    agentTokens: number;
    jevTokens: number;
};

export const getBattleTotals = (turns: BattleTurn[]): BattleTotals =>
    turns.reduce<BattleTotals>(
        (totals, turn) => ({
            totalMs: totals.totalMs + (turn.totalMs ?? 0),
            agentTokens: totals.agentTokens + turn.agentTokens,
            jevTokens: totals.jevTokens + turn.jevTokens,
        }),
        { totalMs: 0, agentTokens: 0, jevTokens: 0 },
    );

/** Assistant messages that finished first at their turn, once both sides have finished it. */
export const getTurnWinners = (
    a: AiAgentThread,
    b: AiAgentThread,
): Set<string> => {
    const turnsB = getBattleTurns(b);
    return new Set(
        getBattleTurns(a).flatMap((turnA, index) => {
            const turnB = turnsB[index];
            if (
                !turnB ||
                turnA.totalMs === null ||
                turnB.totalMs === null ||
                turnA.totalMs === turnB.totalMs
            )
                return [];
            return [turnA.totalMs < turnB.totalMs ? turnA.uuid : turnB.uuid];
        }),
    );
};

const compactFormat = new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
});

export const formatTokenCount = (agent: number, jev: number) => {
    const parts = [
        agent > 0 ? `${compactFormat.format(agent)} agent` : null,
        jev > 0 ? `${compactFormat.format(jev)} JEV` : null,
    ].filter(Boolean);
    return `${parts.length > 0 ? parts.join(' + ') : '0'} tokens`;
};
