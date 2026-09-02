import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import {
    applyFilterLabelOverrides,
    restoreFilterLabelOverrides,
} from './filterLabelOverrides';

const dimensionRule = (
    id: string,
    label: string | undefined,
): DashboardFilterRule => ({
    id,
    label,
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'customers_region', tableName: 'customers' },
    values: ['EU'],
    tileTargets: {},
});

const savedFilters: DashboardFilters = {
    dimensions: [
        dimensionRule('rule-a', 'Region'),
        dimensionRule('rule-b', undefined),
        dimensionRule('rule-c', 'Date range'),
    ],
    metrics: [dimensionRule('rule-m', 'Revenue')],
    tableCalculations: [],
};

const overrides = {
    labels: {
        Region: 'Región',
        'Date range': 'Rango de fechas',
        Revenue: 'Ingresos',
    },
};

describe('applyFilterLabelOverrides', () => {
    it('translates labels by source label and leaves other rule fields untouched', () => {
        const result = applyFilterLabelOverrides(savedFilters, overrides);

        expect(result.dimensions[0]).toEqual({
            ...savedFilters.dimensions[0],
            label: 'Región',
        });
        expect(result.dimensions[1]).toEqual(savedFilters.dimensions[1]);
        expect(result.dimensions[2].label).toBe('Rango de fechas');
        expect(result.metrics[0].label).toBe('Ingresos');
    });

    it('still translates correctly after filters are reordered post-download', () => {
        const reordered: DashboardFilters = {
            ...savedFilters,
            dimensions: [
                savedFilters.dimensions[2],
                savedFilters.dimensions[0],
                savedFilters.dimensions[1],
            ],
        };

        const result = applyFilterLabelOverrides(reordered, overrides);

        expect(result.dimensions[0].label).toBe('Rango de fechas');
        expect(result.dimensions[1].label).toBe('Región');
        expect(result.dimensions[2].label).toBeUndefined();
    });

    it('leaves labels without a translation entry untouched', () => {
        const result = applyFilterLabelOverrides(savedFilters, {
            labels: { 'Some other label': 'Autre' },
        });

        expect(result.dimensions[0].label).toBe('Region');
    });

    it('returns filters unchanged when there are no overrides', () => {
        expect(applyFilterLabelOverrides(savedFilters, undefined)).toBe(
            savedFilters,
        );
    });

    it('ignores empty-string translations', () => {
        const result = applyFilterLabelOverrides(savedFilters, {
            labels: { Region: '' },
        });

        expect(result.dimensions[0].label).toBe('Region');
    });

    it('only applies string translation values', () => {
        const result = applyFilterLabelOverrides(savedFilters, {
            // A host could hand us anything through contentOverrides
            labels: { Region: 42 as unknown as string },
        });

        expect(result.dimensions[0].label).toBe('Region');
    });
});

describe('restoreFilterLabelOverrides', () => {
    const translated = applyFilterLabelOverrides(savedFilters, overrides);

    it('restores original labels for rules still showing the translation', () => {
        const result = restoreFilterLabelOverrides(
            translated,
            savedFilters,
            overrides,
        );

        expect(result.dimensions[0].label).toBe('Region');
        expect(result.dimensions[1].label).toBeUndefined();
        expect(result.dimensions[2].label).toBe('Date range');
        expect(result.metrics[0].label).toBe('Revenue');
    });

    it('restores correctly even when the rules were reordered in the embed', () => {
        const reordered: DashboardFilters = {
            ...translated,
            dimensions: [
                translated.dimensions[2],
                translated.dimensions[0],
                translated.dimensions[1],
            ],
        };

        const result = restoreFilterLabelOverrides(
            reordered,
            savedFilters,
            overrides,
        );

        expect(result.dimensions[0].label).toBe('Date range');
        expect(result.dimensions[1].label).toBe('Region');
    });

    it('keeps a label renamed in the embed editor', () => {
        const renamed: DashboardFilters = {
            ...translated,
            dimensions: [
                { ...translated.dimensions[0], label: 'Customer region' },
                ...translated.dimensions.slice(1),
            ],
        };

        const result = restoreFilterLabelOverrides(
            renamed,
            savedFilters,
            overrides,
        );

        expect(result.dimensions[0].label).toBe('Customer region');
    });

    it('keeps rules added in the embed that are not in the saved dashboard', () => {
        const withNewRule: DashboardFilters = {
            ...translated,
            dimensions: [
                ...translated.dimensions,
                dimensionRule('rule-new', 'Añadido'),
            ],
        };

        const result = restoreFilterLabelOverrides(
            withNewRule,
            savedFilters,
            overrides,
        );

        expect(result.dimensions[3].label).toBe('Añadido');
    });

    it('returns filters unchanged when there are no overrides', () => {
        expect(
            restoreFilterLabelOverrides(translated, savedFilters, undefined),
        ).toBe(translated);
    });
});
