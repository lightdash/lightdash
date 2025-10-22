import {
    FrameBoundaryType,
    FrameType,
    TableCalculationTemplateType,
    WindowFunctionType,
    type TableCalculationTemplate,
} from '@lightdash/common';
import { compileTableCalculationFromTemplate } from './tableCalculationTemplateQueryCompiler';
import { warehouseClientMock } from './utils/QueryBuilder/MetricQueryBuilder.mock';

describe('compileTableCalculationFromTemplate - Frame Clauses', () => {
    it('Should compile window function with running total frame (ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)', () => {
        const template: TableCalculationTemplate = {
            type: TableCalculationTemplateType.WINDOW_FUNCTION,
            windowFunction: WindowFunctionType.SUM,
            fieldId: 'table_revenue',
            orderBy: [{ fieldId: 'table_date', order: 'asc' }],
            partitionBy: [],
            frame: {
                frameType: FrameType.ROWS,
                start: {
                    type: FrameBoundaryType.UNBOUNDED_PRECEDING,
                },
                end: {
                    type: FrameBoundaryType.CURRENT_ROW,
                },
            },
        };

        const result = compileTableCalculationFromTemplate(
            template,
            warehouseClientMock,
            [],
        );

        expect(result).toBe(
            'SUM("table_revenue") OVER (ORDER BY "table_date" ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)',
        );
    });

    it('Should compile window function with 7-day moving average frame (ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)', () => {
        const template: TableCalculationTemplate = {
            type: TableCalculationTemplateType.WINDOW_FUNCTION,
            windowFunction: WindowFunctionType.AVG,
            fieldId: 'table_sales',
            orderBy: [{ fieldId: 'table_date', order: 'asc' }],
            partitionBy: [],
            frame: {
                frameType: FrameType.ROWS,
                start: {
                    type: FrameBoundaryType.PRECEDING,
                    offset: 6,
                },
                end: {
                    type: FrameBoundaryType.CURRENT_ROW,
                },
            },
        };

        const result = compileTableCalculationFromTemplate(
            template,
            warehouseClientMock,
            [],
        );

        expect(result).toBe(
            'AVG("table_sales") OVER (ORDER BY "table_date" ASC ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)',
        );
    });

    it('Should compile window function with centered 3-row window (ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING)', () => {
        const template: TableCalculationTemplate = {
            type: TableCalculationTemplateType.WINDOW_FUNCTION,
            windowFunction: WindowFunctionType.AVG,
            fieldId: 'table_score',
            orderBy: [{ fieldId: 'table_test_date', order: 'asc' }],
            partitionBy: [],
            frame: {
                frameType: FrameType.ROWS,
                start: {
                    type: FrameBoundaryType.PRECEDING,
                    offset: 1,
                },
                end: {
                    type: FrameBoundaryType.FOLLOWING,
                    offset: 1,
                },
            },
        };

        const result = compileTableCalculationFromTemplate(
            template,
            warehouseClientMock,
            [],
        );

        expect(result).toBe(
            'AVG("table_score") OVER (ORDER BY "table_test_date" ASC ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING)',
        );
    });

    it('Should compile window function with single boundary syntax (ROWS 3 PRECEDING)', () => {
        const template: TableCalculationTemplate = {
            type: TableCalculationTemplateType.WINDOW_FUNCTION,
            windowFunction: WindowFunctionType.SUM,
            fieldId: 'table_amount',
            orderBy: [{ fieldId: 'table_date', order: 'asc' }],
            partitionBy: [],
            frame: {
                frameType: FrameType.ROWS,
                end: {
                    type: FrameBoundaryType.PRECEDING,
                    offset: 3,
                },
            },
        };

        const result = compileTableCalculationFromTemplate(
            template,
            warehouseClientMock,
            [],
        );

        expect(result).toBe(
            'SUM("table_amount") OVER (ORDER BY "table_date" ASC ROWS 3 PRECEDING)',
        );
    });

    it('Should compile window function with RANGE frame', () => {
        const template: TableCalculationTemplate = {
            type: TableCalculationTemplateType.WINDOW_FUNCTION,
            windowFunction: WindowFunctionType.SUM,
            fieldId: 'table_points',
            orderBy: [{ fieldId: 'table_score', order: 'asc' }],
            partitionBy: [],
            frame: {
                frameType: FrameType.RANGE,
                start: {
                    type: FrameBoundaryType.UNBOUNDED_PRECEDING,
                },
                end: {
                    type: FrameBoundaryType.CURRENT_ROW,
                },
            },
        };

        const result = compileTableCalculationFromTemplate(
            template,
            warehouseClientMock,
            [],
        );

        expect(result).toBe(
            'SUM("table_points") OVER (ORDER BY "table_score" ASC RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)',
        );
    });

    it('Should compile window function with frame and PARTITION BY', () => {
        const template: TableCalculationTemplate = {
            type: TableCalculationTemplateType.WINDOW_FUNCTION,
            windowFunction: WindowFunctionType.AVG,
            fieldId: 'table_revenue',
            orderBy: [{ fieldId: 'table_date', order: 'asc' }],
            partitionBy: ['table_category', 'table_region'],
            frame: {
                frameType: FrameType.ROWS,
                start: {
                    type: FrameBoundaryType.PRECEDING,
                    offset: 6,
                },
                end: {
                    type: FrameBoundaryType.CURRENT_ROW,
                },
            },
        };

        const result = compileTableCalculationFromTemplate(
            template,
            warehouseClientMock,
            [],
        );

        expect(result).toBe(
            'AVG("table_revenue") OVER (PARTITION BY "table_category", "table_region" ORDER BY "table_date" ASC ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)',
        );
    });

    it('Should compile window function with UNBOUNDED FOLLOWING', () => {
        const template: TableCalculationTemplate = {
            type: TableCalculationTemplateType.WINDOW_FUNCTION,
            windowFunction: WindowFunctionType.SUM,
            fieldId: 'table_revenue',
            orderBy: [{ fieldId: 'table_month', order: 'asc' }],
            partitionBy: ['table_year'],
            frame: {
                frameType: FrameType.ROWS,
                start: {
                    type: FrameBoundaryType.CURRENT_ROW,
                },
                end: {
                    type: FrameBoundaryType.UNBOUNDED_FOLLOWING,
                },
            },
        };

        const result = compileTableCalculationFromTemplate(
            template,
            warehouseClientMock,
            [],
        );

        expect(result).toBe(
            'SUM("table_revenue") OVER (PARTITION BY "table_year" ORDER BY "table_month" ASC ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING)',
        );
    });

    it('Should compile window function without frame clause (backward compatibility)', () => {
        const template: TableCalculationTemplate = {
            type: TableCalculationTemplateType.WINDOW_FUNCTION,
            windowFunction: WindowFunctionType.ROW_NUMBER,
            fieldId: null,
            orderBy: [{ fieldId: 'table_date', order: 'asc' }],
            partitionBy: [],
        };

        const result = compileTableCalculationFromTemplate(
            template,
            warehouseClientMock,
            [],
        );

        expect(result).toBe('ROW_NUMBER() OVER (ORDER BY "table_date" ASC)');
    });

    it('Should compile window function with frame but no PARTITION BY', () => {
        const template: TableCalculationTemplate = {
            type: TableCalculationTemplateType.WINDOW_FUNCTION,
            windowFunction: WindowFunctionType.COUNT,
            fieldId: 'table_id',
            orderBy: [{ fieldId: 'table_date', order: 'desc' }],
            partitionBy: [],
            frame: {
                frameType: FrameType.ROWS,
                start: {
                    type: FrameBoundaryType.UNBOUNDED_PRECEDING,
                },
                end: {
                    type: FrameBoundaryType.CURRENT_ROW,
                },
            },
        };

        const result = compileTableCalculationFromTemplate(
            template,
            warehouseClientMock,
            [],
        );

        expect(result).toBe(
            'COUNT("table_id") OVER (ORDER BY "table_date" DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)',
        );
    });

    it('Should compile MIN window function with frame', () => {
        const template: TableCalculationTemplate = {
            type: TableCalculationTemplateType.WINDOW_FUNCTION,
            windowFunction: WindowFunctionType.MIN,
            fieldId: 'table_price',
            orderBy: [{ fieldId: 'table_date', order: 'asc' }],
            partitionBy: [],
            frame: {
                frameType: FrameType.ROWS,
                start: {
                    type: FrameBoundaryType.PRECEDING,
                    offset: 2,
                },
                end: {
                    type: FrameBoundaryType.FOLLOWING,
                    offset: 2,
                },
            },
        };

        const result = compileTableCalculationFromTemplate(
            template,
            warehouseClientMock,
            [],
        );

        expect(result).toBe(
            'MIN("table_price") OVER (ORDER BY "table_date" ASC ROWS BETWEEN 2 PRECEDING AND 2 FOLLOWING)',
        );
    });

    it('Should compile MAX window function with frame', () => {
        const template: TableCalculationTemplate = {
            type: TableCalculationTemplateType.WINDOW_FUNCTION,
            windowFunction: WindowFunctionType.MAX,
            fieldId: 'table_price',
            orderBy: [{ fieldId: 'table_date', order: 'asc' }],
            partitionBy: [],
            frame: {
                frameType: FrameType.ROWS,
                start: {
                    type: FrameBoundaryType.PRECEDING,
                    offset: 5,
                },
                end: {
                    type: FrameBoundaryType.CURRENT_ROW,
                },
            },
        };

        const result = compileTableCalculationFromTemplate(
            template,
            warehouseClientMock,
            [],
        );

        expect(result).toBe(
            'MAX("table_price") OVER (ORDER BY "table_date" ASC ROWS BETWEEN 5 PRECEDING AND CURRENT ROW)',
        );
    });

    it('Should throw error when PRECEDING boundary is missing offset', () => {
        const template: TableCalculationTemplate = {
            type: TableCalculationTemplateType.WINDOW_FUNCTION,
            windowFunction: WindowFunctionType.SUM,
            fieldId: 'table_amount',
            orderBy: [{ fieldId: 'table_date', order: 'asc' }],
            partitionBy: [],
            frame: {
                frameType: FrameType.ROWS,
                start: {
                    type: FrameBoundaryType.PRECEDING,
                    // offset is missing
                },
                end: {
                    type: FrameBoundaryType.CURRENT_ROW,
                },
            },
        };

        expect(() =>
            compileTableCalculationFromTemplate(
                template,
                warehouseClientMock,
                [],
            ),
        ).toThrow('PRECEDING boundary requires offset');
    });

    it('Should throw error when FOLLOWING boundary is missing offset', () => {
        const template: TableCalculationTemplate = {
            type: TableCalculationTemplateType.WINDOW_FUNCTION,
            windowFunction: WindowFunctionType.AVG,
            fieldId: 'table_value',
            orderBy: [{ fieldId: 'table_date', order: 'asc' }],
            partitionBy: [],
            frame: {
                frameType: FrameType.ROWS,
                start: {
                    type: FrameBoundaryType.CURRENT_ROW,
                },
                end: {
                    type: FrameBoundaryType.FOLLOWING,
                    // offset is missing
                },
            },
        };

        expect(() =>
            compileTableCalculationFromTemplate(
                template,
                warehouseClientMock,
                [],
            ),
        ).toThrow('FOLLOWING boundary requires offset');
    });

    it('Should compile PERCENT_RANK with frame (ranking function with frame)', () => {
        const template: TableCalculationTemplate = {
            type: TableCalculationTemplateType.WINDOW_FUNCTION,
            windowFunction: WindowFunctionType.PERCENT_RANK,
            fieldId: null,
            orderBy: [{ fieldId: 'table_score', order: 'desc' }],
            partitionBy: ['table_category'],
            frame: {
                frameType: FrameType.ROWS,
                start: {
                    type: FrameBoundaryType.UNBOUNDED_PRECEDING,
                },
                end: {
                    type: FrameBoundaryType.UNBOUNDED_FOLLOWING,
                },
            },
        };

        const result = compileTableCalculationFromTemplate(
            template,
            warehouseClientMock,
            [],
        );

        expect(result).toBe(
            'PERCENT_RANK() OVER (PARTITION BY "table_category" ORDER BY "table_score" DESC ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)',
        );
    });

    it('Should compile CUME_DIST window function', () => {
        const template: TableCalculationTemplate = {
            type: TableCalculationTemplateType.WINDOW_FUNCTION,
            windowFunction: WindowFunctionType.CUME_DIST,
            fieldId: null,
            orderBy: [{ fieldId: 'table_score', order: 'desc' }],
            partitionBy: ['table_category'],
        };

        const result = compileTableCalculationFromTemplate(
            template,
            warehouseClientMock,
            [],
        );

        expect(result).toBe(
            'CUME_DIST() OVER (PARTITION BY "table_category" ORDER BY "table_score" DESC)',
        );
    });

    it('Should compile RANK window function', () => {
        const template: TableCalculationTemplate = {
            type: TableCalculationTemplateType.WINDOW_FUNCTION,
            windowFunction: WindowFunctionType.RANK,
            fieldId: null,
            orderBy: [{ fieldId: 'table_revenue', order: 'desc' }],
            partitionBy: [],
        };

        const result = compileTableCalculationFromTemplate(
            template,
            warehouseClientMock,
            [],
        );

        expect(result).toBe('RANK() OVER (ORDER BY "table_revenue" DESC)');
    });

    it('Should compile window function with multiple orderBy fields and frame', () => {
        const template: TableCalculationTemplate = {
            type: TableCalculationTemplateType.WINDOW_FUNCTION,
            windowFunction: WindowFunctionType.SUM,
            fieldId: 'table_amount',
            orderBy: [
                { fieldId: 'table_year', order: 'asc' },
                { fieldId: 'table_month', order: 'asc' },
                { fieldId: 'table_day', order: 'asc' },
            ],
            partitionBy: [],
            frame: {
                frameType: FrameType.ROWS,
                start: {
                    type: FrameBoundaryType.PRECEDING,
                    offset: 6,
                },
                end: {
                    type: FrameBoundaryType.CURRENT_ROW,
                },
            },
        };

        const result = compileTableCalculationFromTemplate(
            template,
            warehouseClientMock,
            [],
        );

        expect(result).toBe(
            'SUM("table_amount") OVER (ORDER BY "table_year" ASC, "table_month" ASC, "table_day" ASC ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)',
        );
    });

    describe('RUNNING_TOTAL sort fields', () => {
        it('Should compile RUNNING_TOTAL with single ascending sort field', () => {
            const template: TableCalculationTemplate = {
                type: TableCalculationTemplateType.RUNNING_TOTAL,
                fieldId: 'table_revenue',
            };

            const result = compileTableCalculationFromTemplate(
                template,
                warehouseClientMock,
                [{ fieldId: 'table_date', descending: false }],
            );

            expect(result).toBe(
                'SUM("table_revenue") OVER (ORDER BY "table_date" ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)',
            );
        });

        it('Should compile RUNNING_TOTAL with single descending sort field', () => {
            const template: TableCalculationTemplate = {
                type: TableCalculationTemplateType.RUNNING_TOTAL,
                fieldId: 'table_revenue',
            };

            const result = compileTableCalculationFromTemplate(
                template,
                warehouseClientMock,
                [{ fieldId: 'table_date', descending: true }],
            );

            expect(result).toBe(
                'SUM("table_revenue") OVER (ORDER BY "table_date" DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)',
            );
        });

        it('Should compile RUNNING_TOTAL with multiple sort fields', () => {
            const template: TableCalculationTemplate = {
                type: TableCalculationTemplateType.RUNNING_TOTAL,
                fieldId: 'table_revenue',
            };

            const result = compileTableCalculationFromTemplate(
                template,
                warehouseClientMock,
                [
                    { fieldId: 'table_year', descending: false },
                    { fieldId: 'table_month', descending: false },
                    { fieldId: 'table_day', descending: true },
                ],
            );

            expect(result).toBe(
                'SUM("table_revenue") OVER (ORDER BY "table_year" ASC, "table_month" ASC, "table_day" DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)',
            );
        });

        it('Should compile RUNNING_TOTAL without sort fields (empty array)', () => {
            const template: TableCalculationTemplate = {
                type: TableCalculationTemplateType.RUNNING_TOTAL,
                fieldId: 'table_revenue',
            };

            const result = compileTableCalculationFromTemplate(
                template,
                warehouseClientMock,
                [],
            );

            expect(result).toBe(
                'SUM("table_revenue") OVER (ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)',
            );
        });

        it('Should compile RUNNING_TOTAL with mixed ascending and descending sort fields', () => {
            const template: TableCalculationTemplate = {
                type: TableCalculationTemplateType.RUNNING_TOTAL,
                fieldId: 'table_sales',
            };

            const result = compileTableCalculationFromTemplate(
                template,
                warehouseClientMock,
                [
                    { fieldId: 'table_region', descending: false },
                    { fieldId: 'table_date', descending: true },
                ],
            );

            expect(result).toBe(
                'SUM("table_sales") OVER (ORDER BY "table_region" ASC, "table_date" DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)',
            );
        });
    });
});
