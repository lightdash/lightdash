import { type AiAgentThread } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    formatTokenCount,
    getBattleTotals,
    getBattleTurns,
    getTurnWinners,
} from './battleTurns';

const assistant = (
    uuid: string,
    totalMs: number,
    tokenUsage: {
        totalTokens: number;
        decisionInputTokens?: number;
        decisionOutputTokens?: number;
    },
) => ({
    role: 'assistant' as const,
    uuid,
    status: 'idle' as const,
    tokenUsage,
    responseTiming: {
        startedAt: new Date(0).toISOString(),
        firstTokenAt: new Date(100).toISOString(),
        finishedAt: new Date(totalMs).toISOString(),
    },
});

const thread = (messages: unknown[]) =>
    ({ messages }) as unknown as AiAgentThread;

describe('battle turns', () => {
    it('totals time and tokens across the session', () => {
        const turns = getBattleTurns(
            thread([
                { role: 'user', uuid: 'u1' },
                assistant('a1', 12_000, { totalTokens: 140_000 }),
                assistant('a2', 700, {
                    totalTokens: 0,
                    decisionInputTokens: 9_000,
                    decisionOutputTokens: 400,
                }),
            ]),
        );
        expect(getBattleTotals(turns)).toEqual({
            totalMs: 12_700,
            agentTokens: 140_000,
            jevTokens: 9_400,
        });
    });

    it('medals the faster side of each finished turn', () => {
        const baseline = thread([
            assistant('b1', 10_000, { totalTokens: 100_000 }),
            assistant('b2', 30_000, { totalTokens: 100_000 }),
            assistant('b3', 9_000, { totalTokens: 100_000 }),
        ]);
        const fast = thread([
            assistant('a1', 12_000, { totalTokens: 140_000 }),
            assistant('a2', 700, { totalTokens: 0 }),
        ]);
        expect([...getTurnWinners(baseline, fast)]).toEqual(['b1', 'a2']);
    });

    it('splits token counts between the agent and JEV', () => {
        expect(formatTokenCount(0, 12_651)).toBe('12.7K JEV tokens');
        expect(formatTokenCount(313_183, 83_169)).toBe(
            '313.2K agent + 83.2K JEV tokens',
        );
        expect(formatTokenCount(0, 0)).toBe('0 tokens');
    });
});
