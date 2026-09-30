import { type ParameterDefinitions } from '../types/parameters';
import {
    getDashboardTileParameterOverrides,
    resolveDashboardTileParameters,
    resolveFallbackParameterValues,
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
