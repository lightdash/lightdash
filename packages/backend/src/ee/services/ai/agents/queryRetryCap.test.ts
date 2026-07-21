import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import {
    buildQueryRetryStepOverride,
    classifyQueryResult,
    collectQueryResultClasses,
    QUERY_TOOL_NAMES,
    shouldCapQueryRetries,
} from './queryRetryCap';

const toolResultMessage = (
    toolName: string,
    output: { type: string; value: string },
): ModelMessage =>
    ({
        role: 'tool',
        content: [{ type: 'tool-result', toolCallId: 'id', toolName, output }],
    }) as unknown as ModelMessage;

describe('classifyQueryResult', () => {
    it('treats a non-error result as ok', () => {
        expect(classifyQueryResult({ type: 'text', value: 'Total\n42' })).toBe(
            'ok',
        );
    });

    it('classifies a warehouse timeout as warehouse-slow', () => {
        expect(
            classifyQueryResult({
                type: 'error-text',
                value: 'Error running query. Query polling timed out after 300000ms',
            }),
        ).toBe('warehouse-slow');
    });

    it('classifies a dropped connection as warehouse-slow', () => {
        expect(
            classifyQueryResult({
                type: 'error-text',
                value: 'Error running query. Connection terminated unexpectedly',
            }),
        ).toBe('warehouse-slow');
    });

    it('does not bucket warehouse-specific errors — any non-timeout failure is other', () => {
        // Permission / scan-limit / bad-SQL errors are all treated the same;
        // we never match warehouse-specific prose.
        expect(
            classifyQueryResult({
                type: 'error-text',
                value: 'Error running query. Access Denied: User does not have permission to query table',
            }),
        ).toBe('other');
        expect(
            classifyQueryResult({
                type: 'error-text',
                value: 'Error running query. Query exceeded limit for bytesBilledLimitExceeded',
            }),
        ).toBe('other');
        expect(
            classifyQueryResult({
                type: 'error-text',
                value: 'Error running query. Something inexplicable happened',
            }),
        ).toBe('other');
    });
});

describe('shouldCapQueryRetries', () => {
    it('does not cap below the thresholds', () => {
        expect(shouldCapQueryRetries(['ok', 'other']).capped).toBe(false);
        expect(shouldCapQueryRetries(['warehouse-slow', 'ok']).capped).toBe(
            false,
        );
    });

    it('caps after two warehouse-slow errors', () => {
        expect(
            shouldCapQueryRetries(['warehouse-slow', 'warehouse-slow']).capped,
        ).toBe(true);
    });

    it('caps after three errors of any kind', () => {
        expect(shouldCapQueryRetries(['other', 'other', 'other']).capped).toBe(
            true,
        );
    });

    it('does not count successful (ok) calls toward the cap', () => {
        expect(
            shouldCapQueryRetries(['ok', 'ok', 'ok', 'ok', 'other']).capped,
        ).toBe(false);
    });
});

describe('collectQueryResultClasses', () => {
    it('collects and classifies query-tool results in order', () => {
        const messages: ModelMessage[] = [
            toolResultMessage('generateVisualization', {
                type: 'error-text',
                value: 'Error running query. Query polling timed out after 300000ms',
            }),
            toolResultMessage('grepFields', {
                type: 'text',
                value: 'some fields',
            }),
            toolResultMessage('runQuery', {
                type: 'error-text',
                value: 'Error running query. Invalid custom metric',
            }),
        ];
        expect(collectQueryResultClasses(messages, QUERY_TOOL_NAMES)).toEqual([
            'warehouse-slow',
            'other',
        ]);
    });

    it('collects runSql results', () => {
        const messages: ModelMessage[] = [
            toolResultMessage('runSql', {
                type: 'error-text',
                value: 'Error running SQL query. Access Denied: no permission',
            }),
        ];
        expect(collectQueryResultClasses(messages, QUERY_TOOL_NAMES)).toEqual([
            'other',
        ]);
    });

    it('ignores non-query tools', () => {
        const messages: ModelMessage[] = [
            toolResultMessage('searchFieldValues', {
                type: 'error-text',
                value: 'timed out',
            }),
        ];
        expect(collectQueryResultClasses(messages, QUERY_TOOL_NAMES)).toEqual(
            [],
        );
    });
});

describe('buildQueryRetryStepOverride', () => {
    const allTools = [
        'generateVisualization',
        'runQuery',
        'runSql',
        'grepFields',
    ];

    it('returns null when the cap has not tripped', () => {
        const messages: ModelMessage[] = [
            toolResultMessage('generateVisualization', {
                type: 'error-text',
                value: 'Error running query. Invalid custom metric',
            }),
        ];
        expect(buildQueryRetryStepOverride(messages, allTools)).toBeNull();
    });

    it('drops the query tools and nudges once tripped', () => {
        const err = {
            type: 'error-text',
            value: 'Error running query. Query polling timed out after 300000ms',
        };
        const messages: ModelMessage[] = [
            toolResultMessage('generateVisualization', err),
            toolResultMessage('generateVisualization', err),
        ];
        const override = buildQueryRetryStepOverride(messages, allTools);
        expect(override?.activeTools).toEqual(['grepFields']);
        expect(override?.nudge.toLowerCase()).toContain('do not');
    });

    it('surfaces the warehouse error and instructs the agent to relay it', () => {
        const err = {
            type: 'error-text',
            value: 'Error running SQL query. Access Denied: User does not have permission to query table my-project:dataset.orders\n\nTry again if you believe the error can be resolved.',
        };
        const messages: ModelMessage[] = [
            toolResultMessage('runSql', err),
            toolResultMessage('runSql', err),
            toolResultMessage('runSql', err),
        ];
        const override = buildQueryRetryStepOverride(messages, allTools);
        expect(override?.activeTools).not.toContain('runSql');
        // The wrapping prefix/suffix are stripped; the real warehouse text stays.
        expect(override?.nudge).toContain(
            'Access Denied: User does not have permission to query table',
        );
        expect(override?.nudge).not.toContain('Try again if you believe');
        expect(override?.nudge.toLowerCase()).toContain(
            'relay this warehouse error',
        );
    });
});
