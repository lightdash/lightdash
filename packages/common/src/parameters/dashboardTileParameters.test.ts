import { type ParameterDefinitions } from '../types/parameters';
import {
    canUseChartSavedParameterValue,
    DashboardTileParameterSource,
    getDashboardTileParameterOverrides,
    getDashboardTileParameterSource,
    getMissingRequiredDashboardParameters,
    resolveDashboardTileParameters,
    resolveFallbackParameterValues,
    type DashboardParameterStatusInputs,
    type ParameterFallbackSources,
} from './dashboardTileParameters';

const now = new Date('2026-09-17T23:30:00Z'); // 18 Sep in Auckland

const fallbackSources = (
    overrides: Partial<ParameterFallbackSources> = {},
): ParameterFallbackSources => ({
    projectDefinitions: {},
    exploreDefinitions: {},
    virtualViewSavedValues: {},
    now,
    timezone: 'UTC',
    ...overrides,
});

const statusWithDefault: ParameterDefinitions = {
    status: { label: 'Status', default: 'all' },
};
const statusWithoutDefault: ParameterDefinitions = {
    status: { label: 'Status' },
};

describe('resolveFallbackParameterValues', () => {
    it('layers project defaults < explore defaults < virtual view saved values', () => {
        expect(
            resolveFallbackParameterValues(
                fallbackSources({
                    projectDefinitions: {
                        a: { label: 'A', default: 'project' },
                        b: { label: 'B', default: 'project' },
                        c: { label: 'C', default: 'project' },
                        d: { label: 'D' },
                    },
                    exploreDefinitions: {
                        b: { label: 'B', default: 'explore' },
                        c: { label: 'C', default: 'explore' },
                    },
                    virtualViewSavedValues: { c: 'view' },
                }),
            ),
        ).toEqual({ a: 'project', b: 'explore', c: 'view' });
    });

    it('resolves a today default in the given timezone at execution', () => {
        const sources = fallbackSources({
            projectDefinitions: {
                period_to: { label: 'To', type: 'date', default: 'today' },
            },
        });
        expect(resolveFallbackParameterValues(sources)).toEqual({
            period_to: '2026-09-17',
        });
        expect(
            resolveFallbackParameterValues({
                ...sources,
                timezone: 'Pacific/Auckland',
            }),
        ).toEqual({ period_to: '2026-09-18' });
    });
});

describe('resolveDashboardTileParameters', () => {
    const resolveStatus = ({
        definitions,
        chartSaved,
        dashboard,
    }: {
        definitions: ParameterDefinitions;
        chartSaved: string | null;
        dashboard: string | null;
    }) =>
        resolveDashboardTileParameters({
            fallbackSources: fallbackSources({
                exploreDefinitions: definitions,
            }),
            dashboardValues: dashboard === null ? {} : { status: dashboard },
            chartSavedValues: chartSaved === null ? {} : { status: chartSaved },
            isTargeted: true,
        }).status;

    it.each([
        // definition default, chart saved, dashboard value → expected
        [true, 'Cancelled', 'Shipped', 'Shipped'],
        [true, 'Cancelled', null, 'all'],
        [true, null, 'Shipped', 'Shipped'],
        [true, null, null, 'all'],
        [false, 'Cancelled', 'Shipped', 'Shipped'],
        [false, 'Cancelled', null, 'Cancelled'],
        [false, null, 'Shipped', 'Shipped'],
        [false, null, null, undefined],
    ])(
        'definition default %s, chart saved %s, dashboard %s resolves %s',
        (hasDefault, chartSaved, dashboard, expected) => {
            expect(
                resolveStatus({
                    definitions: hasDefault
                        ? statusWithDefault
                        : statusWithoutDefault,
                    chartSaved,
                    dashboard,
                }),
            ).toBe(expected);
        },
    );

    it('resolves each key independently', () => {
        expect(
            resolveDashboardTileParameters({
                fallbackSources: fallbackSources({
                    projectDefinitions: {
                        region: { label: 'Region', default: 'EU' },
                        year: { label: 'Year' },
                        tier: { label: 'Tier' },
                    },
                    exploreDefinitions: statusWithDefault,
                }),
                dashboardValues: { tier: 'gold' },
                chartSavedValues: {
                    status: 'Cancelled',
                    region: 'US',
                    year: '2024',
                    tier: 'silver',
                },
                isTargeted: true,
            }),
        ).toEqual({
            status: 'all',
            region: 'EU',
            year: '2024',
            tier: 'gold',
        });
    });

    it('counts a project-only default as the definition default', () => {
        expect(
            resolveDashboardTileParameters({
                fallbackSources: fallbackSources({
                    projectDefinitions: statusWithDefault,
                }),
                dashboardValues: {},
                chartSavedValues: { status: 'Cancelled' },
                isTargeted: true,
            }),
        ).toEqual({ status: 'all' });
    });

    it('uses the effective definition when the explore redefines a project parameter', () => {
        expect(
            resolveDashboardTileParameters({
                fallbackSources: fallbackSources({
                    projectDefinitions: statusWithDefault,
                    exploreDefinitions: statusWithoutDefault,
                }),
                dashboardValues: {},
                chartSavedValues: { status: 'Cancelled' },
                isTargeted: true,
            }),
        ).toEqual({ status: 'Cancelled' });
    });

    it('prefers the chart saved value over a virtual view saved value without a definition default', () => {
        expect(
            resolveDashboardTileParameters({
                fallbackSources: fallbackSources({
                    exploreDefinitions: statusWithoutDefault,
                    virtualViewSavedValues: { status: 'view' },
                }),
                dashboardValues: {},
                chartSavedValues: { status: 'Cancelled' },
                isTargeted: true,
            }).status,
        ).toBe('Cancelled');
    });

    it('keeps the virtual view saved value over the definition default', () => {
        expect(
            resolveDashboardTileParameters({
                fallbackSources: fallbackSources({
                    exploreDefinitions: statusWithDefault,
                    virtualViewSavedValues: { status: 'view' },
                }),
                dashboardValues: {},
                chartSavedValues: { status: 'Cancelled' },
                isTargeted: true,
            }).status,
        ).toBe('view');
    });

    it('resolves a today default at execution instead of the chart saved date', () => {
        expect(
            resolveDashboardTileParameters({
                fallbackSources: fallbackSources({
                    exploreDefinitions: {
                        period_to: {
                            label: 'To',
                            type: 'date',
                            default: 'today',
                        },
                    },
                    timezone: 'Pacific/Auckland',
                }),
                dashboardValues: {},
                chartSavedValues: { period_to: '2025-01-01' },
                isTargeted: true,
            }),
        ).toEqual({ period_to: '2026-09-18' });
    });

    it('passes through keys that have no definition', () => {
        expect(
            resolveDashboardTileParameters({
                fallbackSources: fallbackSources(),
                dashboardValues: { unknown: 'x' },
                chartSavedValues: { other: 'y' },
                isTargeted: true,
            }),
        ).toEqual({ unknown: 'x', other: 'y' });
    });

    it('ignores dashboard values and the default rule on an untargeted tile', () => {
        expect(
            resolveDashboardTileParameters({
                fallbackSources: fallbackSources({
                    exploreDefinitions: {
                        ...statusWithDefault,
                        region: { label: 'Region', default: 'EU' },
                    },
                }),
                dashboardValues: { status: 'Shipped', region: 'US' },
                chartSavedValues: { status: 'Cancelled' },
                isTargeted: false,
            }),
        ).toEqual({ status: 'Cancelled', region: 'EU' });
    });
});

describe('getDashboardTileParameterOverrides', () => {
    it('omits keys the fallback chain should resolve', () => {
        expect(
            getDashboardTileParameterOverrides({
                definitions: {
                    ...statusWithDefault,
                    region: { label: 'Region' },
                },
                dashboardValues: {},
                chartSavedValues: { status: 'Cancelled', region: 'US' },
                isTargeted: true,
            }),
        ).toEqual({ region: 'US' });
    });
});

describe('getDashboardTileParameterSource', () => {
    const sourceOfStatus = ({
        definitions,
        chartSaved,
        dashboard,
        isTargeted,
    }: {
        definitions: ParameterDefinitions;
        chartSaved: string | null;
        dashboard: string | null;
        isTargeted: boolean;
    }) =>
        getDashboardTileParameterSource({
            key: 'status',
            definitions,
            dashboardValues: dashboard === null ? {} : { status: dashboard },
            chartSavedValues: chartSaved === null ? {} : { status: chartSaved },
            isTargeted,
        });

    it.each([
        // targeted, definition default, chart saved, dashboard value → expected
        [
            true,
            true,
            'Cancelled',
            'Shipped',
            DashboardTileParameterSource.DASHBOARD,
        ],
        [true, true, 'Cancelled', null, DashboardTileParameterSource.DEFAULT],
        [true, true, null, 'Shipped', DashboardTileParameterSource.DASHBOARD],
        [true, true, null, null, DashboardTileParameterSource.DEFAULT],
        [
            true,
            false,
            'Cancelled',
            'Shipped',
            DashboardTileParameterSource.DASHBOARD,
        ],
        [true, false, 'Cancelled', null, DashboardTileParameterSource.CHART],
        [true, false, null, 'Shipped', DashboardTileParameterSource.DASHBOARD],
        [true, false, null, null, DashboardTileParameterSource.DEFAULT],
        [
            false,
            true,
            'Cancelled',
            'Shipped',
            DashboardTileParameterSource.CHART,
        ],
        [false, true, 'Cancelled', null, DashboardTileParameterSource.CHART],
        [false, true, null, 'Shipped', DashboardTileParameterSource.DEFAULT],
        [false, true, null, null, DashboardTileParameterSource.DEFAULT],
        [
            false,
            false,
            'Cancelled',
            'Shipped',
            DashboardTileParameterSource.CHART,
        ],
        [false, false, null, 'Shipped', DashboardTileParameterSource.DEFAULT],
    ])(
        'targeted %s, definition default %s, chart saved %s, dashboard %s comes from %s',
        (isTargeted, hasDefault, chartSaved, dashboard, expected) => {
            expect(
                sourceOfStatus({
                    definitions: hasDefault
                        ? statusWithDefault
                        : statusWithoutDefault,
                    chartSaved,
                    dashboard,
                    isTargeted,
                }),
            ).toBe(expected);
        },
    );

    it('treats a key without a definition like one without a default', () => {
        const inputs = {
            definitions: {},
            dashboardValues: { unknown: 'x' },
            chartSavedValues: { other: 'y' },
            isTargeted: true,
        };
        expect(
            getDashboardTileParameterSource({ ...inputs, key: 'unknown' }),
        ).toBe(DashboardTileParameterSource.DASHBOARD);
        expect(
            getDashboardTileParameterSource({ ...inputs, key: 'other' }),
        ).toBe(DashboardTileParameterSource.CHART);
        expect(
            getDashboardTileParameterSource({ ...inputs, key: 'absent' }),
        ).toBe(DashboardTileParameterSource.DEFAULT);
    });
});

describe('dashboard parameter status', () => {
    const definitions: ParameterDefinitions = {
        status: { label: 'Status' },
        region: { label: 'Region' },
        currency: { label: 'Currency', default: 'USD' },
    };

    it('does not flag a key when the referencing tile has a chart-saved value', () => {
        const inputs: DashboardParameterStatusInputs = {
            tiles: [
                {
                    parameterReferences: ['status'],
                    chartSavedValues: { status: 'Cancelled' },
                },
            ],
            dashboardValues: {},
            definitions,
        };
        expect(getMissingRequiredDashboardParameters(inputs)).toEqual([]);
    });

    it('flags a key when a referencing tile has no value, default or chart-saved value', () => {
        const inputs: DashboardParameterStatusInputs = {
            tiles: [{ parameterReferences: ['status'], chartSavedValues: {} }],
            dashboardValues: {},
            definitions,
        };
        expect(getMissingRequiredDashboardParameters(inputs)).toEqual([
            'status',
        ]);
    });

    it('never flags a key with a definition default, even without chart values', () => {
        const inputs: DashboardParameterStatusInputs = {
            tiles: [
                {
                    parameterReferences: ['currency'],
                    chartSavedValues: { currency: 'EUR' },
                },
                { parameterReferences: ['currency'], chartSavedValues: {} },
            ],
            dashboardValues: {},
            definitions,
        };
        expect(getMissingRequiredDashboardParameters(inputs)).toEqual([]);
    });

    it('treats a dashboard value as resolving the key for every tile', () => {
        const inputs: DashboardParameterStatusInputs = {
            tiles: [{ parameterReferences: ['status'], chartSavedValues: {} }],
            dashboardValues: { status: 'Completed' },
            definitions,
        };
        expect(getMissingRequiredDashboardParameters(inputs)).toEqual([]);
    });

    it('resolves each key per tile across multiple keys', () => {
        const inputs: DashboardParameterStatusInputs = {
            tiles: [
                {
                    parameterReferences: ['status', 'region'],
                    chartSavedValues: { status: 'Cancelled', region: 'EU' },
                },
                {
                    parameterReferences: ['status', 'region'],
                    chartSavedValues: { status: 'Completed' },
                },
            ],
            dashboardValues: {},
            definitions,
        };
        expect(getMissingRequiredDashboardParameters(inputs)).toEqual([
            'region',
        ]);
    });

    it('ignores chart-saved values for keys the tile does not reference, and reserved keys', () => {
        const inputs: DashboardParameterStatusInputs = {
            tiles: [
                {
                    parameterReferences: ['status', 'date_zoom'],
                    chartSavedValues: {},
                },
                {
                    parameterReferences: [],
                    chartSavedValues: { status: 'Cancelled' },
                },
            ],
            dashboardValues: {},
            definitions,
        };
        expect(getMissingRequiredDashboardParameters(inputs)).toEqual([
            'status',
        ]);
    });
});

describe('canUseChartSavedParameterValue', () => {
    it('allows the chart value without a dashboard value or default', () => {
        expect(
            canUseChartSavedParameterValue({
                key: 'status',
                dashboardValues: {},
                definitions: statusWithoutDefault,
            }),
        ).toBe(true);
    });

    it('allows the chart value for a key with no definition', () => {
        expect(
            canUseChartSavedParameterValue({
                key: 'status',
                dashboardValues: {},
                definitions: {},
            }),
        ).toBe(true);
    });

    it('rejects the chart value when the dashboard has a value', () => {
        expect(
            canUseChartSavedParameterValue({
                key: 'status',
                dashboardValues: { status: 'Shipped' },
                definitions: statusWithoutDefault,
            }),
        ).toBe(false);
    });

    it('rejects the chart value when the definition has a default', () => {
        expect(
            canUseChartSavedParameterValue({
                key: 'status',
                dashboardValues: {},
                definitions: statusWithDefault,
            }),
        ).toBe(false);
    });

    it('only looks at the given key', () => {
        expect(
            canUseChartSavedParameterValue({
                key: 'region',
                dashboardValues: { status: 'Shipped' },
                definitions: statusWithDefault,
            }),
        ).toBe(true);
    });
});

describe("values outside a parameter's fixed options", () => {
    const definitions: ParameterDefinitions = {
        zoom: {
            label: 'Zoom',
            default: 'monthly',
            options: ['weekly', 'monthly'],
        },
        region: { label: 'Region', options: ['eu', 'us'] },
    };

    it('falls back to the default when the dashboard value is not an option', () => {
        expect(
            resolveDashboardTileParameters({
                fallbackSources: fallbackSources({
                    projectDefinitions: definitions,
                }),
                dashboardValues: { zoom: 'true' },
                chartSavedValues: {},
                isTargeted: true,
            }),
        ).toEqual({ zoom: 'monthly' });
    });

    it('uses a valid chart saved value when the dashboard value is not an option', () => {
        const inputs = {
            definitions,
            dashboardValues: { region: 'apac' },
            chartSavedValues: { region: 'eu' },
            isTargeted: true,
        };
        expect(getDashboardTileParameterOverrides(inputs)).toEqual({
            region: 'eu',
        });
        expect(
            getDashboardTileParameterSource({ ...inputs, key: 'region' }),
        ).toBe(DashboardTileParameterSource.CHART);
    });

    it('ignores a chart saved value that is not an option', () => {
        expect(
            getDashboardTileParameterOverrides({
                definitions,
                dashboardValues: {},
                chartSavedValues: { region: 'apac' },
                isTargeted: false,
            }),
        ).toEqual({});
    });

    it('ignores a virtual view saved value that is not an option', () => {
        expect(
            resolveFallbackParameterValues(
                fallbackSources({
                    projectDefinitions: definitions,
                    virtualViewSavedValues: { zoom: 'true' },
                }),
            ),
        ).toEqual({ zoom: 'monthly' });
    });

    it('flags a key as missing when its only values are not options', () => {
        expect(
            getMissingRequiredDashboardParameters({
                definitions,
                dashboardValues: { region: 'apac' },
                tiles: [
                    {
                        parameterReferences: ['region'],
                        chartSavedValues: { region: 'latam' },
                    },
                ],
            }),
        ).toEqual(['region']);
    });
});
