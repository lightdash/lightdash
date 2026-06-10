import { FilterOperator } from '@lightdash/common';
import { findMalformedDashboardFilters } from './lint';

describe('findMalformedDashboardFilters (PROD-7445)', () => {
    const filter = (overrides: Record<string, unknown> = {}) => ({
        operator: FilterOperator.EQUALS,
        disabled: false,
        values: [],
        label: 'Promo code',
        target: { fieldId: 'orders_promo_code', tableName: 'orders' },
        ...overrides,
    });

    const dashboard = (dimensions: unknown[]) => ({
        version: 1,
        name: 'd',
        slug: 'd',
        spaceSlug: 's',
        tiles: [],
        filters: { dimensions, metrics: [], tableCalculations: [] },
    });

    it('flags the malformed-empty filter shape from the ticket', () => {
        const warnings = findMalformedDashboardFilters(dashboard([filter()]));
        expect(warnings).toHaveLength(1);
        expect(warnings[0].keyword).toBe('malformedEmptyDashboardFilter');
        expect(warnings[0].instancePath).toBe('/filters/dimensions/0');
        expect(warnings[0].message).toContain('orders_promo_code');
    });

    it('does not flag disabled filters (UI "any value" shape)', () => {
        const warnings = findMalformedDashboardFilters(
            dashboard([filter({ disabled: true })]),
        );
        expect(warnings).toEqual([]);
    });

    it('does not flag notNull / isNull / inPeriodToDate filters', () => {
        const warnings = findMalformedDashboardFilters(
            dashboard([
                filter({ operator: FilterOperator.NOT_NULL }),
                filter({ operator: FilterOperator.NULL }),
                filter({ operator: FilterOperator.IN_PERIOD_TO_DATE }),
            ]),
        );
        expect(warnings).toEqual([]);
    });

    it('does not flag filters with values', () => {
        const warnings = findMalformedDashboardFilters(
            dashboard([filter({ values: ['SAVE10'] })]),
        );
        expect(warnings).toEqual([]);
    });

    it('returns an entry per malformed filter, preserving index', () => {
        const warnings = findMalformedDashboardFilters(
            dashboard([
                filter({ values: ['SAVE10'] }), // ok
                filter(), // malformed
                filter({ disabled: true }), // ok
                filter({ target: { fieldId: 'other', tableName: 'orders' } }), // malformed
            ]),
        );
        expect(warnings).toHaveLength(2);
        expect(warnings.map((w) => w.instancePath)).toEqual([
            '/filters/dimensions/1',
            '/filters/dimensions/3',
        ]);
    });

    it('is a no-op for dashboards without filters', () => {
        expect(
            findMalformedDashboardFilters({ version: 1, tiles: [] }),
        ).toEqual([]);
    });

    it('is a no-op for non-object input', () => {
        expect(findMalformedDashboardFilters(null)).toEqual([]);
        expect(findMalformedDashboardFilters(undefined)).toEqual([]);
        expect(findMalformedDashboardFilters('not-a-dashboard')).toEqual([]);
    });

    it('also flags malformed metric and tableCalculation filters', () => {
        const warnings = findMalformedDashboardFilters({
            version: 1,
            tiles: [],
            filters: {
                dimensions: [filter()],
                metrics: [filter()],
                tableCalculations: [filter()],
            },
        });
        expect(warnings).toHaveLength(3);
        expect(warnings.map((w) => w.instancePath)).toEqual([
            '/filters/dimensions/0',
            '/filters/metrics/0',
            '/filters/tableCalculations/0',
        ]);
    });

    it('treats YAML `values: ~` (null) as empty', () => {
        const warnings = findMalformedDashboardFilters({
            version: 1,
            tiles: [],
            filters: { dimensions: [filter({ values: null })] },
        });
        expect(warnings).toHaveLength(1);
    });
});
