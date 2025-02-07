import { type DbtColumnLightdashMetric } from './dbt';
import { NotImplementedError } from './errors';
import { FilterOperator, UnitOfTime, type MetricFilterRule } from './filter';
import { parseFilters } from './filterGrammar';
import { convertMetricFilterToDbt } from './filterGrammarConversion';

describe('convertMetricFilterToDbt', () => {
    it('should return undefined if filters are undefined', () => {
        expect(convertMetricFilterToDbt(undefined)).toBeUndefined();
    });

    it('should return an empty array if filters are an empty array', () => {
        expect(convertMetricFilterToDbt([])).toEqual([]);
    });

    it('should convert EQUALS filter correctly', () => {
        const filters: MetricFilterRule[] = [
            {
                target: { fieldRef: 'customers.customer_id' },
                id: '1',
                operator: FilterOperator.EQUALS,
                values: ['value1'],
            },
        ];
        const expected: DbtColumnLightdashMetric['filters'] = [
            { customer_id: 'value1' },
        ];
        expect(convertMetricFilterToDbt(filters)).toEqual(expected);
    });
    it('should convert EQUALS with multiple values correctly', () => {
        const filters: MetricFilterRule[] = [
            {
                target: { fieldRef: 'customers.customer_id' },
                id: '1',
                operator: FilterOperator.EQUALS,
                values: ['value1', 'value2'],
            },
        ];
        const expected: DbtColumnLightdashMetric['filters'] = [
            { customer_id: ['value1', 'value2'] },
        ];
        expect(convertMetricFilterToDbt(filters)).toEqual(expected);
    });

    it('should convert NOT_EQUALS filter correctly', () => {
        const filters: MetricFilterRule[] = [
            {
                target: { fieldRef: 'field2' },
                id: '1',
                operator: FilterOperator.NOT_EQUALS,
                values: ['value2'],
            },
        ];
        const expected: DbtColumnLightdashMetric['filters'] = [
            { field2: '!value2' },
        ];
        expect(convertMetricFilterToDbt(filters)).toEqual(expected);
    });
    it('should convert NULL filters correctly', () => {
        const filters: MetricFilterRule[] = [
            {
                target: { fieldRef: 'field1' },
                id: '1',
                operator: FilterOperator.NULL,
                values: [],
            },
            {
                target: { fieldRef: 'field2' },
                id: '1',
                operator: FilterOperator.NOT_NULL,
                values: [],
            },
        ];
        const expected: DbtColumnLightdashMetric['filters'] = [
            { field1: 'null' },
            { field2: '!null' },
        ];
        expect(convertMetricFilterToDbt(filters)).toEqual(expected);
    });

    it('should convert boolean filters correctly', () => {
        const filters: MetricFilterRule[] = [
            {
                target: { fieldRef: 'field2' },
                id: '1',
                operator: FilterOperator.EQUALS,
                values: [false],
            },
            {
                target: { fieldRef: 'field3' },
                id: '1',
                operator: FilterOperator.NOT_EQUALS,
                values: [true],
            },
        ];
        const expected: DbtColumnLightdashMetric['filters'] = [
            { field2: 'false' },
            { field3: '!true' },
        ];
        expect(convertMetricFilterToDbt(filters)).toEqual(expected);
    });

    it('should convert INCLUDE filters correctly', () => {
        const filters: MetricFilterRule[] = [
            {
                target: { fieldRef: 'field1' },
                id: '1',
                operator: FilterOperator.INCLUDE,
                values: ['katie'],
            },
        ];
        const expected: DbtColumnLightdashMetric['filters'] = [
            { field1: '%katie%' },
        ];
        expect(convertMetricFilterToDbt(filters)).toEqual(expected);
    });

    it('should convert STARTS_WITH and ENDS_WITH filters correctly', () => {
        const filters: MetricFilterRule[] = [
            {
                target: { fieldRef: 'field1' },
                id: '1',
                operator: FilterOperator.STARTS_WITH,
                values: ['katie'],
            },
            {
                target: { fieldRef: 'field2' },
                id: '2',
                operator: FilterOperator.ENDS_WITH,
                values: ['katie'],
            },
        ];
        const expected: DbtColumnLightdashMetric['filters'] = [
            { field1: 'katie%' },
            { field2: '%katie' },
        ];
        expect(convertMetricFilterToDbt(filters)).toEqual(expected);
    });

    it('should convert GREATER_THAN and GREATER_THAN_OR_EQUAL filters correctly', () => {
        const filters: MetricFilterRule[] = [
            {
                target: { fieldRef: 'field1' },
                id: '1',
                operator: FilterOperator.GREATER_THAN,
                values: ['4'],
            },
            {
                target: { fieldRef: 'field2' },
                id: '2',
                operator: FilterOperator.GREATER_THAN_OR_EQUAL,
                values: ['5'],
            },
        ];
        const expected: DbtColumnLightdashMetric['filters'] = [
            { field1: '> 4' },
            { field2: '>= 5' },
        ];
        expect(convertMetricFilterToDbt(filters)).toEqual(expected);
    });

    it('should convert IN_THE_NEXT and IN_THE_PAST filters correctly', () => {
        const filters: MetricFilterRule[] = [
            {
                target: { fieldRef: 'field1' },
                id: '1',
                operator: FilterOperator.IN_THE_NEXT,
                values: ['14'],
                settings: {
                    unitOfTime: UnitOfTime.days,
                    completed: false,
                },
            },

            {
                target: { fieldRef: 'field4' },
                id: '2',
                operator: FilterOperator.IN_THE_PAST,
                values: [14],
                settings: {
                    unitOfTime: UnitOfTime.months,
                    completed: false,
                },
            },
        ];
        const expected: DbtColumnLightdashMetric['filters'] = [
            { field1: 'inTheNext 14 days' },
            { field4: 'inThePast 14 months' },
        ];
        expect(convertMetricFilterToDbt(filters)).toEqual(expected);
    });

    it('should throw error on convert IN_THE_NEXT and IN_THE_PAST with completed', () => {
        const filters: MetricFilterRule[] = [
            {
                target: { fieldRef: 'field1' },
                id: '1',
                operator: FilterOperator.IN_THE_NEXT,
                values: ['14'],
                settings: {
                    unitOfTime: UnitOfTime.days,
                    completed: true,
                },
            },
        ];

        expect(() => convertMetricFilterToDbt(filters)).toThrow(
            NotImplementedError,
        );
    });
    it('should handle filters with undefined or empty values', () => {
        const filters: MetricFilterRule[] = [
            {
                target: { fieldRef: 'field3' },
                id: '1',
                operator: FilterOperator.EQUALS,
                values: [],
            },
            {
                target: { fieldRef: 'field4' },
                id: '2',
                operator: FilterOperator.EQUALS,
                values: [undefined],
            },
        ];
        expect(convertMetricFilterToDbt(filters)).toEqual([]);
    });

    it('should throw NotImplementedError for unsupported operators', () => {
        const filters: MetricFilterRule[] = [
            {
                target: { fieldRef: 'field5' },
                id: '1',
                operator: FilterOperator.IN_BETWEEN,
                values: ['value3', 'value4'],
            },
        ];
        expect(() => convertMetricFilterToDbt(filters)).toThrow(
            'No function implemented to convert custom metric filter to dbt: inBetween',
        );
    });
});

describe('convert from filterGrammar', () => {
    it('should return undefined if filters are undefined', () => {
        expect(convertMetricFilterToDbt(undefined)).toBeUndefined();
    });

    it('should convert EQUALS filter correctly', () => {
        const rawFilters = [{ name: 'pedram' }];
        const filters = parseFilters(rawFilters);
        expect(filters[0].operator).toEqual('equals');
        expect(filters[0].values).toEqual(['pedram']);
        expect(filters[0].target.fieldRef).toEqual('name');
        expect(convertMetricFilterToDbt(filters)).toEqual(rawFilters);
    });

    it('should convert NOT_EQUALS filter correctly', () => {
        const rawFilters = [{ name: '!pedram' }];
        expect(convertMetricFilterToDbt(parseFilters(rawFilters))).toEqual(
            rawFilters,
        );
    });

    it('should convert EQUALS with multiple values correctly', () => {
        const rawFilters = [{ customer_id: ['1', '2'] }];
        const filters = parseFilters(rawFilters);
        expect(filters[0].values).toEqual(['1', '2']);
        expect(convertMetricFilterToDbt(filters)).toEqual(rawFilters);
    });

    it('should convert NULL filter correctly', () => {
        const rawFilters = [{ customer_id: 'null' }];
        expect(convertMetricFilterToDbt(parseFilters(rawFilters))).toEqual(
            rawFilters,
        );
    });

    it('should convert IN_THE_NEXT filter correctly', () => {
        const rawFilters = [{ timestamp: 'inTheNext 14 days' }];
        expect(convertMetricFilterToDbt(parseFilters(rawFilters))).toEqual(
            rawFilters,
        );
    });

    it('should convert STARTS_WITH filter correctly', () => {
        const rawFilters = [{ name: 'katie%' }];
        expect(convertMetricFilterToDbt(parseFilters(rawFilters))).toEqual(
            rawFilters,
        );
    });
});
