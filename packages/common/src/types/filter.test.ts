import { ConditionalOperator } from './conditionalRule';
import {
    compressDashboardFiltersToParam,
    convertDashboardFiltersParamToDashboardFilters,
} from './filter';

describe('compress and uncompress dashboard filters', () => {
    describe('compressDashboardFiltersToParam', () => {
        const DUMMY_DIMENSION = {
            id: 'filter-id',
            label: 'A label',
            operator: ConditionalOperator.EQUALS,
            target: {
                fieldId: 'payments_payment_method',
                tableName: 'payments',
            },
            tileTargets: {},
            disabled: false,
            values: ['credit_card'],
        };
        it('should create no tile targets when there are no overrides', async () => {
            expect(
                compressDashboardFiltersToParam({
                    dimensions: [DUMMY_DIMENSION],
                    metrics: [],
                    tableCalculations: [],
                }),
            ).toEqual({
                dimensions: [
                    {
                        id: 'filter-id',
                        label: 'A label',
                        operator: 'equals',
                        target: {
                            fieldId: 'payments_payment_method',
                            tableName: 'payments',
                        },
                        tileTargets: [],
                        disabled: false,
                        values: ['credit_card'],
                    },
                ],
                metrics: [],
                tableCalculations: [],
            });
        });
        it('should set tile target to "false" when tile is disabled', async () => {
            expect(
                compressDashboardFiltersToParam({
                    dimensions: [
                        {
                            ...DUMMY_DIMENSION,
                            tileTargets: { 'chart-id-no-filter': false },
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                }).dimensions[0].tileTargets,
            ).toEqual([{ 'chart-id-no-filter': false }]);
        });
        it('should set tile target overrides when filter fields dont match tile fields', async () => {
            expect(
                compressDashboardFiltersToParam({
                    dimensions: [
                        {
                            ...DUMMY_DIMENSION,
                            tileTargets: {
                                'chart-id-modified-filter': {
                                    fieldId: 'a_different_field',
                                    tableName: 'a_different_table',
                                },
                            },
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                }).dimensions[0].tileTargets,
            ).toEqual([
                {
                    'chart-id-modified-filter': {
                        fieldId: 'a_different_field',
                        tableName: 'a_different_table',
                    },
                },
            ]);
        });
        it('should NOT set tile targets when filter fields DO match tile fields', async () => {
            expect(
                compressDashboardFiltersToParam({
                    dimensions: [
                        {
                            ...DUMMY_DIMENSION,
                            tileTargets: {
                                'chart-id': {
                                    fieldId: 'payments_payment_method',
                                    tableName: 'payments',
                                },
                            },
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                }).dimensions[0].tileTargets,
            ).toEqual([]);
        });
        it('should handle disabled, override and default cases together', async () => {
            const compressedFilters = compressDashboardFiltersToParam({
                dimensions: [
                    {
                        ...DUMMY_DIMENSION,
                        tileTargets: {
                            'chart-id': {
                                fieldId: 'payments_payment_method',
                                tableName: 'payments',
                            },
                            'chart-id-no-filter': false,
                            'chart-id-modified-filter': {
                                fieldId: 'a_different_field',
                                tableName: 'a_different_table',
                            },
                            'chart-id-no-filter2': false,
                        },
                    },
                ],
                metrics: [
                    {
                        ...DUMMY_DIMENSION,
                        tileTargets: {
                            'metric-chart-id': {
                                fieldId: 'payments_payment_method',
                                tableName: 'payments',
                            },
                            'metric-chart-id-no-filter': false,
                            'metric-chart-id-modified-filter': {
                                fieldId: 'a_different_field',
                                tableName: 'a_different_table',
                            },
                            'metric-chart-id-no-filter2': false,
                        },
                    },
                ],
                tableCalculations: [],
            });

            expect(compressedFilters.dimensions[0].tileTargets).toEqual([
                { 'chart-id-no-filter': false },
                {
                    'chart-id-modified-filter': {
                        fieldId: 'a_different_field',
                        tableName: 'a_different_table',
                    },
                },
                { 'chart-id-no-filter2': false },
            ]);
            expect(compressedFilters.metrics[0].tileTargets).toEqual([
                { 'metric-chart-id-no-filter': false },
                {
                    'metric-chart-id-modified-filter': {
                        fieldId: 'a_different_field',
                        tableName: 'a_different_table',
                    },
                },
                { 'metric-chart-id-no-filter2': false },
            ]);
        });
    });
    describe('convertDashboardFiltersParamToDashboardFilters', () => {
        const DUMMY_URL_FILTER = {
            id: 'url-dimension',
            label: 'a label',
            operator: ConditionalOperator.EQUALS,
            target: {
                fieldId: 'payments_payment_method',
                tableName: 'payments',
            },
            tileTargets: [],
            disabled: false,
            values: ['credit_card'],
        };
        it('should convert filters with no tile targets', async () => {
            expect(
                convertDashboardFiltersParamToDashboardFilters({
                    dimensions: [DUMMY_URL_FILTER],
                    metrics: [],
                    tableCalculations: [],
                }),
            ).toEqual({
                dimensions: [
                    {
                        id: 'url-dimension',
                        label: 'a label',
                        operator: 'equals',
                        target: {
                            fieldId: 'payments_payment_method',
                            tableName: 'payments',
                        },
                        tileTargets: {},
                        disabled: false,
                        values: ['credit_card'],
                    },
                ],
                metrics: [],
                tableCalculations: [],
            });
        });
        it('should have modified tile targets when target modified', async () => {
            expect(
                convertDashboardFiltersParamToDashboardFilters({
                    dimensions: [
                        {
                            ...DUMMY_URL_FILTER,
                            tileTargets: [
                                {
                                    'chart-id-modified-filter': {
                                        fieldId: 'other-field',
                                        tableName: 'other-table',
                                    },
                                },
                            ],
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                }).dimensions[0].tileTargets,
            ).toEqual({
                'chart-id-modified-filter': {
                    fieldId: 'other-field',
                    tableName: 'other-table',
                },
            });
        });
        it('should have disabled tile targets when target is "false"', async () => {
            expect(
                convertDashboardFiltersParamToDashboardFilters({
                    dimensions: [
                        {
                            ...DUMMY_URL_FILTER,
                            tileTargets: [{ 'chart-id-no-filter': false }],
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                }).dimensions[0].tileTargets,
            ).toEqual({ 'chart-id-no-filter': false });
        });
        it('should omit tile target string (for back-compat)', async () => {
            expect(
                convertDashboardFiltersParamToDashboardFilters({
                    dimensions: [
                        {
                            ...DUMMY_URL_FILTER,
                            tileTargets: ['an-id'],
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                }).dimensions[0].tileTargets,
            ).toEqual({});
        });
        it('should handle normal, modified and disabled tile targets', async () => {
            expect(
                convertDashboardFiltersParamToDashboardFilters({
                    dimensions: [
                        {
                            ...DUMMY_URL_FILTER,
                            tileTargets: [
                                'an-id',
                                { 'chart-id-no-filter': false },
                                'another-id',
                                {
                                    'chart-id-modified-filter': {
                                        fieldId: 'other-field',
                                        tableName: 'other-table',
                                    },
                                },
                            ],
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                }).dimensions[0].tileTargets,
            ).toEqual({
                'chart-id-no-filter': false,
                'chart-id-modified-filter': {
                    fieldId: 'other-field',
                    tableName: 'other-table',
                },
            });
        });
    });
});
