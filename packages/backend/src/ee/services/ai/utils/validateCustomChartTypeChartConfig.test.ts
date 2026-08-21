import {
    AiAgentValidatorError,
    type DataAppVizSchema,
    type ToolRunQueryCustomChartTypeConfig,
} from '@lightdash/common';
import { validateCustomChartTypeChartConfig } from './validators';

const vizSchema: DataAppVizSchema = {
    fields: [
        { name: 'x', label: 'X axis', type: 'dimension', required: true },
        { name: 'y', label: 'Y axis', type: 'metric', required: true },
        { name: 'series', label: 'Series', type: 'series', required: false },
    ],
    configOptions: [],
    colorPalette: null,
};

const selectedFieldIds = [
    'orders_order_date_month',
    'orders_revenue',
    'orders_status',
];

const buildChartConfig = (
    fieldMapping: Record<string, string>,
): ToolRunQueryCustomChartTypeConfig => ({
    customChartTypeSlug: 'cohort-waterfall',
    fieldMapping,
    options: null,
});

describe('validateCustomChartTypeChartConfig', () => {
    it('accepts a mapping that binds all required slots to selected fields', () => {
        expect(() =>
            validateCustomChartTypeChartConfig(
                buildChartConfig({
                    x: 'orders_order_date_month',
                    y: 'orders_revenue',
                }),
                vizSchema,
                selectedFieldIds,
            ),
        ).not.toThrow();
    });

    it('accepts optional slots being bound too', () => {
        expect(() =>
            validateCustomChartTypeChartConfig(
                buildChartConfig({
                    x: 'orders_order_date_month',
                    y: 'orders_revenue',
                    series: 'orders_status',
                }),
                vizSchema,
                selectedFieldIds,
            ),
        ).not.toThrow();
    });

    it('rejects unknown slot names, listing the declared slots', () => {
        expect(() =>
            validateCustomChartTypeChartConfig(
                buildChartConfig({
                    x: 'orders_order_date_month',
                    y: 'orders_revenue',
                    nonsense: 'orders_status',
                }),
                vizSchema,
                selectedFieldIds,
            ),
        ).toThrow(
            expect.objectContaining({
                message: expect.stringContaining(
                    'Unknown field slots in fieldMapping: nonsense. This custom chart type declares these slots: x, y, series.',
                ),
            }),
        );
    });

    it('rejects an unbound required slot', () => {
        expect(() =>
            validateCustomChartTypeChartConfig(
                buildChartConfig({ x: 'orders_order_date_month' }),
                vizSchema,
                selectedFieldIds,
            ),
        ).toThrow(
            expect.objectContaining({
                message: expect.stringContaining(
                    'Required field slots not bound in fieldMapping: y.',
                ),
            }),
        );
    });

    it('rejects field ids that are not selected in the query, listing available fields', () => {
        expect(() =>
            validateCustomChartTypeChartConfig(
                buildChartConfig({
                    x: 'orders_order_date_month',
                    y: 'customers_count',
                }),
                vizSchema,
                selectedFieldIds,
            ),
        ).toThrow(
            expect.objectContaining({
                message: expect.stringContaining(
                    'fieldMapping references field ids that are not selected in queryConfig: y → customers_count. Fields selected in this query: orders_order_date_month, orders_revenue, orders_status.',
                ),
            }),
        );
    });

    it('throws AiAgentValidatorError mentioning the slug and the retry path', () => {
        try {
            validateCustomChartTypeChartConfig(
                buildChartConfig({}),
                vizSchema,
                selectedFieldIds,
            );
            throw new Error('expected validation to throw');
        } catch (e) {
            expect(e).toBeInstanceOf(AiAgentValidatorError);
            const { message } = e as Error;
            expect(message).toContain('cohort-waterfall');
            expect(message).toContain('findCustomChartTypes');
        }
    });
});
