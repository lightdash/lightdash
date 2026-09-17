import Ajv from 'ajv';
import { expectTypeOf } from 'vitest';
import chartAsCodeSchema from '../../schemas/json/chart-as-code-1.0.json';
import type { SemanticChartAsCode } from '../document';
import type {
    ChartType,
    DataAppVizFieldMapping,
    DataAppVizOptionValues,
} from '../savedCharts';

describe('DataAppVizChartAsCode JSON schema', () => {
    const validate = new Ajv({
        strict: false,
        validateFormats: false,
    }).compile({
        $defs: chartAsCodeSchema.$defs,
        ...chartAsCodeSchema.$defs.DataAppVizChartAsCode,
    });

    it('accepts scalar and ordered array mappings without changing their order', () => {
        const binding = {
            dataAppVizSlug: 'grouped-bars',
            fieldMapping: {
                category: 'orders_status',
                values: ['orders_total_revenue', 'orders_count'],
            },
        };

        expect(validate(binding)).toBe(true);
        expect(binding.fieldMapping.values).toEqual([
            'orders_total_revenue',
            'orders_count',
        ]);
    });

    it('supports the union while preserving the Document scalar chart type', () => {
        expectTypeOf<DataAppVizFieldMapping>().toEqualTypeOf<
            Record<string, string | string[]>
        >();
        expectTypeOf<
            Extract<
                SemanticChartAsCode['chartConfig'],
                { type: ChartType.DATA_APP_VIZ }
            >['config']
        >().toMatchTypeOf<
            | {
                  fieldMapping: Record<string, string>;
                  optionValues?: DataAppVizOptionValues;
                  dataAppVizSlug?: string;
                  dataAppVizUuid?: string;
              }
            | undefined
        >();
    });

    it('keeps the legacy scalar mapping contract', () => {
        expect(
            validate({
                dataAppVizSlug: 'bars',
                fieldMapping: { value: 'orders_count' },
            }),
        ).toBe(true);
    });

    it('rejects non-string mapping entries and nested arrays', () => {
        expect(
            validate({
                dataAppVizSlug: 'grouped-bars',
                fieldMapping: { values: ['orders_total_revenue', 3] },
            }),
        ).toBe(false);
        expect(
            validate({
                dataAppVizSlug: 'grouped-bars',
                fieldMapping: { values: [['orders_total_revenue']] },
            }),
        ).toBe(false);
    });
});
