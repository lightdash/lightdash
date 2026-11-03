import { describe, expect, it } from 'vitest';
import { getLiveSourceToolTarget } from './getLiveSourceToolTarget';
import { type ToolCallSummary } from './types';

const call = (
    toolName: ToolCallSummary['toolName'],
    toolArgs: unknown,
): ToolCallSummary => ({ toolCallId: `${toolName}-1`, toolName, toolArgs });

describe('getLiveSourceToolTarget', () => {
    it('reads the connection a field listing names', () => {
        expect(
            getLiveSourceToolTarget([
                call('listLiveSourceFields', {
                    connectionUuid: 'conn-1',
                    status: 'all',
                    search: null,
                }),
            ]),
        ).toEqual({ kind: 'connection', connectionUuid: 'conn-1' });
    });

    it('reads the explore a field search or content query names', () => {
        expect(
            getLiveSourceToolTarget([
                call('grepFields', {
                    exploreName: 'posthog_events',
                    patterns: ['plan'],
                }),
            ]),
        ).toEqual({ kind: 'explore', exploreName: 'posthog_events' });
        expect(
            getLiveSourceToolTarget([
                call('runContentQuery', {
                    source: { type: 'metricQuery', tableName: 'ga4_events' },
                }),
            ]),
        ).toEqual({ kind: 'explore', exploreName: 'ga4_events' });
    });

    it('reads the explore when every query node reads the same one', () => {
        expect(
            getLiveSourceToolTarget([
                call('query', {
                    queries: [
                        { nodeId: 'a', exploreName: 'posthog_events' },
                        { nodeId: 'b', exploreName: 'posthog_events' },
                    ],
                }),
            ]),
        ).toEqual({ kind: 'explore', exploreName: 'posthog_events' });
    });

    it('reads nothing when nodes or grouped calls read different sources', () => {
        expect(
            getLiveSourceToolTarget([
                call('query', {
                    queries: [
                        { nodeId: 'a', exploreName: 'posthog_events' },
                        { nodeId: 'b', exploreName: 'orders' },
                    ],
                }),
            ]),
        ).toBeNull();
        expect(
            getLiveSourceToolTarget([
                call('grepFields', { exploreName: 'posthog_events' }),
                call('grepFields', { exploreName: 'orders' }),
            ]),
        ).toBeNull();
    });

    it('reads nothing from args without a source', () => {
        expect(
            getLiveSourceToolTarget([call('runSql', { sql: 'select 1' })]),
        ).toBeNull();
        expect(getLiveSourceToolTarget([])).toBeNull();
    });
});
