import { QuerySourceType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getLiveSourceToolTarget } from './getLiveSourceToolTarget';
import { type ToolCallSummary } from './types';

const call = (
    toolName: ToolCallSummary['toolName'],
    toolArgs: unknown,
): ToolCallSummary => ({ toolCallId: `${toolName}-1`, toolName, toolArgs });

const posthog = { kind: 'explore', exploreName: 'posthog_events' } as const;

const semanticNode = (nodeId: string, exploreName: string) => ({
    nodeId,
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    exploreName,
});

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

    it('reads the explore of field searches and lookups', () => {
        expect(
            getLiveSourceToolTarget([
                call('grepFields', {
                    exploreName: 'posthog_events',
                    patterns: ['plan'],
                }),
            ]),
        ).toEqual(posthog);
        expect(
            getLiveSourceToolTarget([
                call('findFields', { table: 'posthog_events' }),
            ]),
        ).toEqual(posthog);
        expect(
            getLiveSourceToolTarget([
                call('searchFieldValues', {
                    table: 'posthog_events',
                    fieldId: 'posthog_events_event',
                }),
            ]),
        ).toEqual(posthog);
        expect(
            getLiveSourceToolTarget([
                call('getMetadata', {
                    requests: [
                        { type: 'explore', exploreIds: ['posthog_events'] },
                        {
                            type: 'field',
                            fields: [
                                {
                                    exploreId: 'posthog_events',
                                    fieldId: 'posthog_events_event',
                                },
                            ],
                        },
                    ],
                }),
            ]),
        ).toEqual(posthog);
    });

    it('reads the explore of every query tool', () => {
        expect(
            getLiveSourceToolTarget([
                call('runQuery', {
                    queryConfig: { exploreName: 'posthog_events' },
                    mergeConfig: null,
                }),
            ]),
        ).toEqual(posthog);
        expect(
            getLiveSourceToolTarget([
                call('generateVisualization', {
                    queryConfig: { exploreName: 'posthog_events' },
                }),
            ]),
        ).toEqual(posthog);
        expect(
            getLiveSourceToolTarget([
                call('runMetricQuery', {
                    vizConfig: { exploreName: 'posthog_events' },
                }),
            ]),
        ).toEqual(posthog);
        expect(
            getLiveSourceToolTarget([
                call('runContentQuery', {
                    source: { type: 'metricQuery', tableName: 'ga4_events' },
                }),
            ]),
        ).toEqual({ kind: 'explore', exploreName: 'ga4_events' });
    });

    it('reads a composer pipeline whose other steps only reshape its rows', () => {
        expect(
            getLiveSourceToolTarget([
                call('runComposerQueries', {
                    queries: [
                        semanticNode('a', 'posthog_events'),
                        semanticNode('b', 'posthog_events'),
                        {
                            nodeId: 'c',
                            sourceType: QuerySourceType.DUCKDB,
                            references: ['a', 'b'],
                        },
                    ],
                }),
            ]),
        ).toEqual(posthog);
    });

    it('reads nothing when calls, nodes or merged queries read different sources', () => {
        expect(
            getLiveSourceToolTarget([
                call('query', {
                    queries: [
                        semanticNode('a', 'posthog_events'),
                        semanticNode('b', 'orders'),
                    ],
                }),
            ]),
        ).toBeNull();
        expect(
            getLiveSourceToolTarget([
                call('query', {
                    queries: [
                        semanticNode('a', 'posthog_events'),
                        {
                            nodeId: 'b',
                            sourceType: QuerySourceType.SQL,
                            sql: 'select 1',
                        },
                    ],
                }),
            ]),
        ).toBeNull();
        expect(
            getLiveSourceToolTarget([
                call('runQuery', {
                    queryConfig: { exploreName: 'posthog_events' },
                    mergeConfig: {
                        additionalSources: [
                            { id: 'b', queryConfig: { exploreName: 'orders' } },
                        ],
                    },
                }),
            ]),
        ).toBeNull();
        expect(
            getLiveSourceToolTarget([
                call('grepFields', { exploreName: 'posthog_events' }),
                call('grepFields', { exploreName: 'orders' }),
            ]),
        ).toBeNull();
        expect(
            getLiveSourceToolTarget([
                call('grepFields', { exploreName: 'posthog_events' }),
                call('runSql', { sql: 'select 1' }),
            ]),
        ).toBeNull();
    });

    it('reads nothing from args without a source', () => {
        expect(
            getLiveSourceToolTarget([call('runSql', { sql: 'select 1' })]),
        ).toBeNull();
        expect(
            getLiveSourceToolTarget([call('runQuery', { title: 'Streaming' })]),
        ).toBeNull();
        expect(getLiveSourceToolTarget([])).toBeNull();
    });
});
