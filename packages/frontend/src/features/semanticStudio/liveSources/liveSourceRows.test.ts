import {
    ApiConnectorType,
    type ExternalConnection,
    type ExternalConnectionApiUsage,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    describeLiveSourceAccessRule,
    formatFreshness,
    formatCacheHits,
    getLiveSourceFreshness,
    toLiveSourceRows,
    type LiveSourceConnection,
} from './liveSourceRows';

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
    windowDays: 32,
    apiCalls: 1234,
    cacheHits: 56,
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
            cacheHitsLabel: '56 hits',
            medianLatency: '600ms',
        });
        expect(unused.usage).toEqual({
            dataRead: expect.any(String),
            apiCalls: '0',
            cacheHitsLabel: '0 hits',
            medianLatency: null,
        });
    });

    it('shows dashes, not zeros, until usage loads', () => {
        const [row] = toLiveSourceRows([connection({})], undefined);
        expect(row.usage).toEqual({
            dataRead: '—',
            apiCalls: '—',
            cacheHitsLabel: null,
            medianLatency: null,
        });
    });
});

describe('formatCacheHits', () => {
    it.each([
        [0, '0 hits'],
        [1, '1 hit'],
        [2, '2 hits'],
        [1_204, `${(1_204).toLocaleString()} hits`],
    ])('describes %s as %s', (count, label) => {
        expect(formatCacheHits(count)).toBe(label);
    });
});

describe('live source freshness', () => {
    it.each([
        [0, 'Always fetch'],
        [30, '30 sec'],
        [60, '1 min'],
        [900, '15 min'],
        [3_600, '1 hour'],
        [86_400, '24 hours'],
    ])('describes %s seconds as %s', (seconds, label) => {
        expect(formatFreshness(seconds)).toBe(label);
    });

    it('uses the integration window until an admin sets one', () => {
        const posthog = {
            apiSource: { connector: ApiConnectorType.POSTHOG, projectId: '1' },
        } as LiveSourceConnection;
        expect(getLiveSourceFreshness(posthog)).toMatchObject({
            seconds: 3_600,
        });
        expect(
            getLiveSourceFreshness({ ...posthog, cacheTtlSeconds: 300 }),
        ).toMatchObject({
            seconds: 300,
        });
        expect(
            getLiveSourceFreshness({ ...posthog, cacheTtlSeconds: 0 }),
        ).toMatchObject({
            seconds: 0,
        });
    });
});

describe('describeLiveSourceAccessRule', () => {
    it.each([
        ['no rule', null, null],
        ['an empty rule', { required: {}, any: {} }, null],
        [
            'required conditions',
            {
                required: { team: ['sales', 'support'], region: ['emea'] },
                any: {},
            },
            'team is sales or support, and region is emea',
        ],
        [
            'any conditions after required ones',
            {
                required: { team: ['sales'] },
                any: { region: ['emea'], tier: ['gold'] },
            },
            'team is sales, and region is emea, or tier is gold',
        ],
    ])('describes %s', (_case, rule, expected) => {
        expect(describeLiveSourceAccessRule(rule)).toBe(expected);
    });
});
