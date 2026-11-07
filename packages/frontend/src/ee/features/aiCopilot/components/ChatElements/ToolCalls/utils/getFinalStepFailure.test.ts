import {
    type AiAgentMessageAssistant,
    type AiAgentToolResult,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { type LiveActivityToolGroup } from '../LiveActivityCard';
import {
    getFinalStepFailure,
    getMessageFinalStepFailure,
} from './getFinalStepFailure';

const result = (
    toolCallId: string,
    status: 'success' | 'error',
    text: string,
): AiAgentToolResult =>
    ({
        uuid: `result-${toolCallId}`,
        promptUuid: 'prompt-1',
        createdAt: new Date(),
        toolCallId,
        toolType: 'built-in',
        toolName: 'runSql',
        result: text,
        metadata: { status },
    }) as AiAgentToolResult;

const group = (toolCallId: string): LiveActivityToolGroup => ({
    toolName: 'runSql',
    keyId: toolCallId,
    calls: [{ toolCallId, toolName: 'runSql', toolArgs: { sql: 'select 1' } }],
});

describe('getFinalStepFailure', () => {
    it('returns the failure the turn ended on', () => {
        const failure = getFinalStepFailure(
            [group('a')],
            [result('a', 'error', 'relation "ad_spend" does not exist')],
        );
        expect(failure?.failures).toEqual([
            {
                toolCallId: 'a',
                message: 'relation "ad_spend" does not exist',
            },
        ]);
        expect(failure?.stepLabel).toBeTruthy();
    });

    it('ignores failures the agent moved past', () => {
        expect(
            getFinalStepFailure(
                [group('a'), group('b')],
                [
                    result('a', 'error', 'syntax error'),
                    result('b', 'success', 'ok'),
                ],
            ),
        ).toBeNull();
    });

    it('returns null when nothing failed', () => {
        expect(getFinalStepFailure([], [])).toBeNull();
        expect(
            getFinalStepFailure([group('a')], [result('a', 'success', 'ok')]),
        ).toBeNull();
    });

    it('keeps the failed SQL so it can reopen in the SQL Runner', () => {
        const failure = getFinalStepFailure(
            [group('a')],
            [result('a', 'error', 'syntax error')],
        );
        expect(failure?.sqlRunnerLinkState).toEqual({ sql: 'select 1' });
    });

    it('has no SQL for failures of other tools', () => {
        const failure = getFinalStepFailure(
            [
                {
                    toolName: 'findExplores',
                    keyId: 'a',
                    calls: [
                        {
                            toolCallId: 'a',
                            toolName: 'findExplores',
                            toolArgs: { sql: 'not a query' },
                        },
                    ],
                },
            ],
            [result('a', 'error', 'not found')],
        );
        expect(failure?.sqlRunnerLinkState).toBeNull();
    });

    it('keeps the SQL of a single failed warehouse composer node', () => {
        const composerGroup = (queries: unknown[]): LiveActivityToolGroup => ({
            toolName: 'query',
            keyId: 'a',
            calls: [
                { toolCallId: 'a', toolName: 'query', toolArgs: { queries } },
            ],
        });
        const sqlNode = { sourceType: 'sql', nodeId: 'spend', sql: 'select 1' };
        const failed = [result('a', 'error', 'relation does not exist')];

        expect(
            getFinalStepFailure([composerGroup([sqlNode])], failed)
                ?.sqlRunnerLinkState,
        ).toEqual({ sql: 'select 1' });
        expect(
            getFinalStepFailure(
                [
                    composerGroup([
                        sqlNode,
                        { sourceType: 'duckdb', nodeId: 'b', sql: 'select 2' },
                    ]),
                ],
                failed,
            )?.sqlRunnerLinkState,
        ).toBeNull();
    });
});

describe('getMessageFinalStepFailure', () => {
    const call = (toolCallId: string, toolName: string) =>
        ({
            uuid: `call-${toolCallId}`,
            promptUuid: 'prompt-1',
            createdAt: new Date(),
            toolCallId,
            toolName,
            toolArgs: { sql: 'select 1' },
            parentToolCallId: null,
        }) as AiAgentMessageAssistant['toolCalls'][number];

    it('ends on the last visible step, skipping hidden tools', () => {
        const failure = getMessageFinalStepFailure({
            toolCalls: [call('a', 'runSql'), call('b', 'improveContext')],
            toolResults: [result('a', 'error', 'syntax error')],
        });
        expect(failure?.failures.map((item) => item.toolCallId)).toEqual(['a']);
    });

    it('is null when a retry of the failed step succeeded', () => {
        expect(
            getMessageFinalStepFailure({
                toolCalls: [call('a', 'runSql'), call('b', 'runSql')],
                toolResults: [
                    result('a', 'error', 'syntax error'),
                    result('b', 'success', 'ok'),
                ],
            }),
        ).toBeNull();
    });

    it('is null for a turn whose last step succeeded', () => {
        expect(
            getMessageFinalStepFailure({
                toolCalls: [call('a', 'runSql')],
                toolResults: [result('a', 'success', 'ok')],
            }),
        ).toBeNull();
    });
});
