import { DuckDBInstance } from '@duckdb/node-api';
import { ChartType } from '@lightdash/common';
import { buildAiTokenDashboard } from './aiTokenDashboard';
import { withAnalyticsChartPresentation } from './analyticsChartPresentation';
import {
    analyticsColorPalette,
    modelDisplayNameSql,
    modelProviderColors,
    modelProviders,
    modelTierRank,
    modelTierRanks,
    modelTierRankSql,
} from './analyticsColorPalette';
import {
    analyticsContentAsCode,
    analyticsLibraryChartBindings,
    analyticsSampleDashboards,
} from './sampleContent';
import { buildUsageDashboards } from './usageDashboards';

type TokenSpec = {
    transform: { joinaggregate?: unknown[]; calculate?: string; as?: string }[];
    layer: {
        transform: unknown[];
        encoding: {
            text?: { value?: string };
            tooltip?: unknown[];
            color?: { legend?: Record<string, unknown> };
            y?: { axis?: Record<string, unknown> };
        };
    }[];
};

const getTokenSpec = (key: string): TokenSpec => {
    const chart = buildAiTokenDashboard().charts.find(({ slug }) =>
        slug.endsWith(`-${key}`),
    )!;
    if (
        chart.chartConfig.type !== ChartType.CUSTOM ||
        !chart.chartConfig.config?.spec
    ) {
        throw new Error('Expected a custom token chart');
    }
    return chart.chartConfig.config.spec as TokenSpec;
};

describe('analytics chart presentation', () => {
    const originalCharts = [
        ...buildUsageDashboards([]),
        buildAiTokenDashboard(),
    ].flatMap(({ charts }) => charts);

    it.each(originalCharts.map((chart) => [chart.slug, chart] as const))(
        'preserves the complete query and identity of %s',
        (_slug, original) => {
            const before = structuredClone(original);
            const result = withAnalyticsChartPresentation(original);
            expect(original).toEqual(before);
            expect(result.metricQuery).toBe(original.metricQuery);
            expect(result.tableConfig).toBe(original.tableConfig);
            expect(result.slug).toBe(original.slug);
            expect(result.dashboardSlug).toBe(original.dashboardSlug);
            expect(result.spaceSlug).toBe(original.spaceSlug);
        },
    );

    it('preserves explicit identity columns in token attribution details', () => {
        const chart = withAnalyticsChartPresentation(
            originalCharts.find(
                ({ slug }) => slug === 'lightdash-analytics-ai-tokens-details',
            )!,
        );
        expect(chart.chartConfig.type).toBe(ChartType.TABLE);
        if (chart.chartConfig.type === ChartType.TABLE) {
            for (const id of [
                'ai_usage_user_id',
                'ai_usage_project_id',
                'ai_usage_agent_id',
            ]) {
                expect(
                    chart.chartConfig.config?.columns?.[id]?.visible,
                ).not.toBe(false);
            }
        }
    });

    it('retains the native daily chart alongside the calendar', () => {
        const original = analyticsSampleDashboards
            .flatMap(({ charts }) => charts)
            .find(({ key }) => key === 'queries-by-day')!;
        const native = analyticsContentAsCode
            .flatMap(({ charts }) => charts)
            .find(
                ({ slug }) =>
                    slug ===
                    'lightdash-analytics-query-activity-queries-by-day',
            )!;
        expect(native.metricQuery).toBe(original.metricQuery);
        expect(native.tableConfig).toBe(original.tableConfig);
        expect(native.chartConfig.type).toBe(ChartType.CARTESIAN);
        expect(native.name).toBe(original.name);
    });

    it('keeps isolated observations visible on line charts', () => {
        for (const { charts } of analyticsContentAsCode) {
            for (const chart of charts) {
                if (chart.chartConfig.type === ChartType.CARTESIAN) {
                    for (const series of chart.chartConfig.config?.eChartsConfig
                        ?.series ?? []) {
                        if (series.type === 'line')
                            expect(series.showSymbol).toBe(true);
                    }
                }
            }
        }
    });

    it.each(['feature-daily', 'feature-rank'])(
        'distinguishes unreported usage from truncated results in %s',
        (key) => {
            const spec = getTokenSpec(key);
            const missingUsage = spec.layer.find(
                (layer) =>
                    layer.encoding?.text?.value === 'No reported token totals',
            );
            const truncated = spec.layer.find((layer) =>
                layer.encoding?.text?.value?.startsWith('Too many groups'),
            );

            // Missing usage must not claim completeness at the query cap.
            expect(missingUsage?.transform[0]).toEqual({
                filter: 'datum.reported_rows === 0 && datum.source_rows < 5000',
            });
            expect(truncated?.transform[0]).toEqual({
                filter: 'datum.source_rows >= 5000',
            });
            // Count valid values, including zero, rather than treating a
            // zero total as absent provider usage.
            expect(spec.transform[0].joinaggregate).toContainEqual({
                op: 'valid',
                field: 'ai_usage_total_tokens_used',
                as: 'reported_rows',
            });
        },
    );

    it('formats token daily tooltips in UTC rather than the viewer timezone', () => {
        const spec = getTokenSpec('feature-daily');
        expect(spec.transform).toContainEqual({
            calculate:
                "utcFormat(toDate(datum.ai_usage_event_ts_day), '%b %-d, %Y')",
            as: 'utc_day_label',
        });
        expect(spec.layer[0].encoding.tooltip).toContainEqual({
            field: 'utc_day_label',
            type: 'nominal',
            title: 'UTC day',
        });
    });

    it('keeps the empty daily legend from collapsing the message out of view', () => {
        const spec = getTokenSpec('feature-daily');
        expect(spec.layer[0].encoding.color?.legend).toMatchObject({
            // The placeholder affects layout only; it must not appear as data
            // in the visual or accessible legend.
            values: {
                expr: "length(domain('color')) ? domain('color') : ['']",
            },
            symbolOpacity: { expr: "length(domain('color')) ? 1 : 0" },
            aria: false,
        });
        expect(spec.layer[0].encoding.y?.axis).toMatchObject({
            labelOpacity: { expr: "length(domain('color')) ? 1 : 0" },
            labelExpr:
                "length(domain('color')) ? replace(replace(datum.label, 'k', 'K'), 'G', 'B') : ''",
            titleOpacity: { expr: "length(domain('color')) ? 1 : 0" },
            gridOpacity: { expr: "length(domain('color')) ? 0.18 : 0" },
        });
    });

    it('keeps every tile inside the grid without overlapping another tile in its tab', () => {
        for (const { dashboard } of analyticsContentAsCode) {
            for (const [index, tile] of dashboard.tiles.entries()) {
                expect(tile.x).toBeGreaterThanOrEqual(0);
                expect(tile.x + tile.w).toBeLessThanOrEqual(36);
                expect(tile.h).toBeGreaterThan(0);
                for (const other of dashboard.tiles
                    .slice(index + 1)
                    .filter(
                        (candidate) => candidate.tabSlug === tile.tabSlug,
                    )) {
                    const overlaps =
                        tile.x < other.x + other.w &&
                        tile.x + tile.w > other.x &&
                        tile.y < other.y + other.h &&
                        tile.y + tile.h > other.y;
                    expect(
                        overlaps,
                        `${dashboard.slug}: ${tile.tileSlug} overlaps ${other.tileSlug}`,
                    ).toBe(false);
                }
            }
        }
    });
});

describe('built-in chart colours', () => {
    const managed = analyticsColorPalette.colors.slice(0, 5);
    // Fixed colours that carry meaning: outcomes, change direction and greys.
    const semantic = [
        '#34D399',
        '#FB923C',
        '#FBBF24',
        '#C92A2A',
        '#868E96',
        '#ADB5BD',
        '#9CA3AF',
        // A deactivated owner
        '#FB7185',
    ];

    it('draws every cartesian series in the Analytics palette, in order', () => {
        const series = analyticsContentAsCode.flatMap(({ charts }) =>
            charts.flatMap((chart) =>
                chart.chartConfig.type === ChartType.CARTESIAN
                    ? [chart.chartConfig.config?.eChartsConfig?.series ?? []]
                    : [],
            ),
        );
        expect(series.length).toBeGreaterThan(0);
        for (const items of series) {
            expect(items.map(({ color }) => color)).toEqual(
                items.map(({ encode }, index) => {
                    // A measure that is an outcome keeps the outcome's colour
                    if (/_passed_/.test(encode.yRef.field)) return '#34D399';
                    if (/_failed_/.test(encode.yRef.field)) return '#FB923C';
                    return managed[index % managed.length];
                }),
            );
        }
    });

    it('draws passed assessments green and failed assessments orange', () => {
        const chart = analyticsContentAsCode
            .flatMap(({ charts }) => charts)
            .find(({ slug }) => slug.endsWith('-assessment-volume-by-day'))!;
        if (chart.chartConfig.type !== ChartType.CARTESIAN) throw new Error();
        expect(
            chart.chartConfig.config?.eChartsConfig?.series?.map(
                ({ color }) => color,
            ),
        ).toEqual(['#34D399', '#FB923C']);
    });

    it('colours pie slices from the palette or a fixed semantic colour', () => {
        const overrides = analyticsContentAsCode.flatMap(({ charts }) =>
            charts.flatMap((chart) =>
                chart.chartConfig.type === ChartType.PIE
                    ? Object.values(
                          chart.chartConfig.config?.groupColorOverrides ?? {},
                      )
                    : [],
            ),
        );
        expect(overrides.length).toBeGreaterThan(0);
        // The status of a dashboard's owner: green, a soft red, amber and grey
        expect(overrides).toEqual(
            expect.arrayContaining(['#FB7185', '#9CA3AF']),
        );
        expect(
            overrides.filter(
                (color) => ![...managed, ...semantic].includes(color),
            ),
        ).toEqual([]);
    });

    it('colours the top five AI token groups from the palette and Other grey', () => {
        const chart = buildAiTokenDashboard().charts.find(
            ({ chartConfig }) => chartConfig.type === ChartType.CUSTOM,
        )!;
        expect(JSON.stringify(chart.chartConfig)).toContain(
            JSON.stringify([...managed, '#868e96']),
        );
    });
});

describe('model tiers', () => {
    it('ranks a model by the longest tier word that matches a whole part of its name', () => {
        const ranks = Object.fromEntries(
            [
                'claude-opus-5',
                'claude-sonnet-5',
                'us.anthropic.claude-haiku-4-5-20251001',
                'gpt-6-astra',
                'gpt-6-sol',
                'gpt-5-mini',
                'gpt-5',
                'gemini-3-ultra',
                'gemini-3.8-flash',
                'gemini-3.8-flash-lite',
                'my-azure-deployment',
            ].map((model) => [model, modelTierRank(model)]),
        );
        expect(ranks).toEqual({
            'claude-opus-5': 0,
            'claude-sonnet-5': 1,
            'us.anthropic.claude-haiku-4-5-20251001': 2,
            'gpt-6-astra': 0,
            'gpt-6-sol': 2,
            'gpt-5-mini': 5,
            // No tier word: after every tier of its provider
            'gpt-5': 8,
            'gemini-3-ultra': 0,
            // "mini" is not a part of "gemini", and "flash-lite" is its own tier below "flash"
            'gemini-3.8-flash': 2,
            'gemini-3.8-flash-lite': 3,
            // No known provider
            'my-azure-deployment': 99,
        });
    });

    it('gives the query, the inline charts and the chart option the same ranking', async () => {
        const models = [
            'claude-opus-5',
            'claude-haiku-4-5-20251001',
            'gpt-5-mini',
            'gemini-3.8-flash-lite',
            'gemini-3.8-flash',
            'my-azure-deployment',
        ];
        const instance = await DuckDBInstance.create(':memory:');
        const db = await instance.connect();
        try {
            const providerSql = `CASE ${modelProviders
                .map(
                    ({ label, prefixes }) =>
                        `WHEN ${prefixes.map((prefix) => `starts_with(lower(m), '${prefix}')`).join(' OR ')} THEN '${label}'`,
                )
                .join(' ')} ELSE 'Other' END`;
            const rows = (
                await db.runAndReadAll(
                    `SELECT m, ${modelTierRankSql('m', 'p')} AS tier, ${modelDisplayNameSql('m')} AS shown
                     FROM (SELECT m, ${providerSql} AS p FROM (SELECT unnest([${models.map((model) => `'${model}'`).join(',')}]) AS m))`,
                )
            ).getRowObjectsJS();
            rows.forEach((row) =>
                expect(Number(row.tier)).toBe(modelTierRank(String(row.m))),
            );
            expect(
                rows.find(({ m }) => m === 'claude-haiku-4-5-20251001')!.shown,
            ).toBe('claude-haiku-4-5');
            expect(rows.find(({ m }) => m === 'gpt-5-mini')!.shown).toBe(
                'gpt-5-mini',
            );
        } finally {
            db.closeSync();
            instance.closeSync();
        }
        // The chart option is the constant itself, and the inline charts carry the same words
        const spec = JSON.stringify(getTokenSpec('model-daily'));
        modelTierRanks
            .split(/[;,]/)
            .forEach((word) =>
                expect(spec).toContain(`(^|[^a-z0-9])${word}($|[^a-z0-9])`),
            );
        const shaded = [...analyticsLibraryChartBindings.values()].filter(
            ({ optionValues }) =>
                optionValues.splitColorGroups === modelProviderColors,
        );
        expect(shaded).toHaveLength(5);
        shaded.forEach(({ optionValues, minVersion }) => {
            expect(optionValues.splitShadeRank).toBe(modelTierRanks);
            expect(minVersion).toBe('0.18.8');
        });
    });
});
