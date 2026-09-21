import { type AiArtifact } from '@lightdash/common';
import {
    deduplicateSlackArtifacts,
    getLegacySlackArtifactImage,
    getSlackArtifactIdentity,
} from './slackArtifactIdentity';

const chart = (version: number, query: object = {}): AiArtifact =>
    ({
        artifactUuid: 'one-artifact-per-thread',
        threadUuid: 'thread',
        promptUuid: 'prompt',
        versionUuid: `version-${version}`,
        versionNumber: version,
        artifactType: 'chart',
        title: 'Revenue',
        description: null,
        savedQueryUuid: null,
        savedSqlUuid: null,
        savedDashboardUuid: null,
        createdAt: new Date('2026-09-20T00:00:00Z'),
        versionCreatedAt: new Date('2026-09-20T00:00:00Z'),
        verifiedByUserUuid: null,
        verifiedAt: null,
        chartConfig: {
            source: 'semantic',
            config: {
                title: 'Revenue',
                description: '',
                queryConfig: {
                    exploreName: 'orders',
                    metrics: ['orders_revenue'],
                    dimensions: [],
                    sorts: [],
                    limit: 500,
                    filters: null,
                    parameters: null,
                    customMetrics: [],
                    tableCalculations: [],
                    ...query,
                },
                chartConfig: null,
            },
        },
        dashboardConfig: null,
    }) as AiArtifact;

describe('Slack artifact identity', () => {
    it('keeps the newest equal query, regardless of title or object-key order', () => {
        const first = chart(1, {
            parameters: { region: 'EU', currency: 'EUR' },
        });
        const second = chart(2, {
            parameters: { currency: 'EUR', region: 'EU' },
        });
        second.title = 'Renamed revenue';
        if (second.chartConfig && 'config' in second.chartConfig) {
            second.chartConfig.config.title = 'Renamed revenue';
        }
        expect(deduplicateSlackArtifacts([first, second])).toEqual([second]);
    });

    it.each([
        { parameters: { id: 'different-tenant' } },
        { dimensions: ['orders_month'] },
        { filters: { expression: 'orders_region = "EU"' } },
        { sorts: [{ fieldId: 'orders_revenue', descending: true }] },
        { limit: 10 },
        { customMetrics: [{ name: 'revenue', sql: 'different formula' }] },
        { tableCalculations: [{ name: 'growth', sql: 'different formula' }] },
    ])('keeps same-title charts when query scope differs: %j', (query) => {
        expect(
            deduplicateSlackArtifacts([chart(1), chart(2, query)]),
        ).toHaveLength(2);
    });

    it('preserves merge IDs, secondary queries, custom versions and presentation', () => {
        const first = chart(1);
        const firstIdentity = getSlackArtifactIdentity(first);
        const cases = [
            {
                source: 'merge',
                schemaVersion: 1,
                config: {
                    ...('config' in first.chartConfig!
                        ? first.chartConfig.config
                        : {}),
                    merge: { additionalSources: [{ id: 'source-a' }] },
                },
            },
            {
                source: 'merge',
                schemaVersion: 1,
                config: {
                    ...('config' in first.chartConfig!
                        ? first.chartConfig.config
                        : {}),
                    merge: { additionalSources: [{ id: 'source-b' }] },
                },
            },
            {
                source: 'customChartType',
                dataAppVizUuid: 'custom',
                dataAppVizVersion: 1,
                config: {},
            },
            {
                source: 'customChartType',
                dataAppVizUuid: 'custom',
                dataAppVizVersion: 2,
                config: {},
            },
            {
                source: 'semantic',
                config: {
                    ...('config' in first.chartConfig!
                        ? first.chartConfig.config
                        : {}),
                    chartConfig: { defaultVizType: 'bar', stackBars: true },
                },
            },
            {
                source: 'semantic',
                config: {
                    ...('config' in first.chartConfig!
                        ? first.chartConfig.config
                        : {}),
                    chartConfig: { defaultVizType: 'bar', stackBars: false },
                },
            },
        ];
        const identities = cases.map((chartConfig) =>
            getSlackArtifactIdentity({ ...first, chartConfig } as AiArtifact),
        );
        expect(new Set([firstIdentity, ...identities]).size).toBe(7);
    });

    it('does not collapse charts from different prompts', () => {
        const first = chart(1);
        const next = { ...chart(2), promptUuid: 'another-prompt' };
        expect(deduplicateSlackArtifacts([first, next])).toEqual([first, next]);
    });

    it('uses stable dashboard identity instead of its title', () => {
        const dashboard = (
            version: number,
            artifactUuid: string,
        ): AiArtifact => ({
            ...chart(version),
            artifactType: 'dashboard',
            artifactUuid,
            chartConfig: null,
            dashboardConfig: {} as AiArtifact['dashboardConfig'],
        });
        const first = dashboard(1, 'dashboard-a');
        const different = dashboard(1, 'dashboard-b');
        const renamed = {
            ...dashboard(2, 'dashboard-a'),
            title: 'Renamed',
            savedDashboardUuid: 'saved-dashboard',
        };
        expect(deduplicateSlackArtifacts([first, different, renamed])).toEqual([
            renamed,
            different,
        ]);
    });

    it('keeps SQL result limits in identity', () => {
        const first = {
            ...chart(1),
            chartConfig: { source: 'sql' as const, sql: 'select 1', limit: 10 },
        };
        const second = {
            ...chart(2),
            chartConfig: { ...first.chartConfig, limit: 20 },
        };
        expect(deduplicateSlackArtifacts([first, second])).toHaveLength(2);
    });
});

describe('legacy Slack image attribution', () => {
    it('keeps original positions after collapsing one chart retry', () => {
        const first = chart(1);
        const retry = chart(2);
        const different = chart(3, { parameters: { region: 'US' } });
        const originals = [first, retry, different];
        const images = ['first.png', 'retry.png', 'different.png'];
        expect(
            deduplicateSlackArtifacts(originals).map((artifact) =>
                getLegacySlackArtifactImage(artifact, originals, images),
            ),
        ).toEqual(['retry.png', 'different.png']);
    });

    it('uses the last image for equivalent retry versions with missing renders', () => {
        expect(
            getLegacySlackArtifactImage(
                chart(3),
                [chart(1), chart(2), chart(3)],
                ['a.png', 'b.png'],
            ),
        ).toBe('b.png');
    });

    it('omits ambiguous images when different charts have missing renders', () => {
        const first = chart(1);
        const different = chart(2, { parameters: { region: 'US' } });
        expect(
            getLegacySlackArtifactImage(
                different,
                [first, different],
                ['one.png'],
            ),
        ).toBeUndefined();
    });
});
