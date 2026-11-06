import {
    ApiConnectorType,
    type ExternalConnection,
    type ExternalConnectionApiUsage,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { toLiveSourceRows } from './liveSourceRows';

const connection = (
    overrides: Partial<ExternalConnection>,
): ExternalConnection =>
    ({
        externalConnectionUuid: 'uuid',
        name: 'Source',
        kind: 'live_source',
        apiSource: { connector: ApiConnectorType.POSTHOG, projectId: '42' },
        ...overrides,
    }) as ExternalConnection;

const usage = (
    externalConnectionUuid: string,
    overrides: Partial<ExternalConnectionApiUsage> = {},
): ExternalConnectionApiUsage => ({
    externalConnectionUuid,
    apiCalls: 1234,
    responseBytes: 361_113,
    medianDurationMs: 600,
    ...overrides,
});

describe('toLiveSourceRows', () => {
    it('keeps live data sources only, by integration then name', () => {
        const rows = toLiveSourceRows(
            [
                connection({ externalConnectionUuid: 'ph-b', name: 'b' }),
                connection({
                    externalConnectionUuid: 'app',
                    kind: 'data_app',
                    apiSource: null,
                }),
                connection({
                    externalConnectionUuid: 'ga',
                    name: 'z',
                    apiSource: {
                        connector: ApiConnectorType.GA4,
                        propertyId: '7',
                    },
                }),
                connection({ externalConnectionUuid: 'ph-a', name: 'a' }),
            ],
            [],
        );
        expect(
            rows.map(({ connection: { externalConnectionUuid } }) => [
                externalConnectionUuid,
            ]),
        ).toEqual([['ga'], ['ph-a'], ['ph-b']]);
        expect(rows[0]).toMatchObject({
            integration: 'Google Analytics 4',
            target: 'Property 7',
        });
        expect(rows[1].target).toBe('Project 42');
    });

    it('formats each source usage, and zero before its first call', () => {
        const [used, unused] = toLiveSourceRows(
            [
                connection({ externalConnectionUuid: 'used', name: 'a' }),
                connection({ externalConnectionUuid: 'unused', name: 'b' }),
            ],
            [usage('used'), usage('other', { apiCalls: 9 })],
        );
        expect(used.usage).toEqual({
            dataRead: expect.stringMatching(/KB|kB/),
            apiCalls: (1234).toLocaleString(),
            medianLatency: '600ms',
        });
        expect(unused.usage).toEqual({
            dataRead: expect.any(String),
            apiCalls: '0',
            medianLatency: null,
        });
    });

    it('shows dashes, not zeros, until usage loads', () => {
        const [row] = toLiveSourceRows([connection({})], undefined);
        expect(row.usage).toEqual({
            dataRead: '—',
            apiCalls: '—',
            medianLatency: null,
        });
    });
});
