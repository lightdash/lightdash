import { DimensionType, FieldType, MetricType } from './field';
import { convertItemTypeToDimensionType } from './results';

const baseMetric = {
    fieldType: FieldType.METRIC,
    name: 'test_metric',
    label: 'Test Metric',
    table: 'test_table',
    tableLabel: 'Test Table',
    sql: 'SELECT 1',
    hidden: false,
};

const baseDimension = {
    fieldType: FieldType.DIMENSION,
    name: 'test_dimension',
    label: 'Test Dimension',
    table: 'test_table',
    tableLabel: 'Test Table',
    sql: 'SELECT 1',
    hidden: false,
    groups: [],
};

describe('convertItemTypeToDimensionType', () => {
    it('should convert VARIANCE metric type to NUMBER dimension type', () => {
        const mockItem = {
            ...baseMetric,
            type: MetricType.VARIANCE,
        };
        expect(convertItemTypeToDimensionType(mockItem)).toEqual(
            DimensionType.NUMBER,
        );
    });

    it('should convert STANDARD_DEVIATION metric type to NUMBER dimension type', () => {
        const mockItem = {
            ...baseMetric,
            type: MetricType.STANDARD_DEVIATION,
        };
        expect(convertItemTypeToDimensionType(mockItem)).toEqual(
            DimensionType.NUMBER,
        );
    });

    it('should convert other numeric metric types to NUMBER dimension type', () => {
        const numericMetrics = [
            MetricType.AVERAGE,
            MetricType.COUNT,
            MetricType.COUNT_DISTINCT,
            MetricType.SUM,
            MetricType.MIN,
            MetricType.MAX,
            MetricType.PERCENTILE,
            MetricType.MEDIAN,
            MetricType.PERCENT_OF_PREVIOUS,
            MetricType.PERCENT_OF_TOTAL,
            MetricType.RUNNING_TOTAL,
        ];

        numericMetrics.forEach((metricType) => {
            const mockItem = {
                ...baseMetric,
                type: metricType,
            };
            expect(convertItemTypeToDimensionType(mockItem)).toEqual(
                DimensionType.NUMBER,
            );
        });
    });

    it('should convert STRING metric type to STRING dimension type', () => {
        const mockItem = {
            ...baseMetric,
            type: MetricType.STRING,
        };
        expect(convertItemTypeToDimensionType(mockItem)).toEqual(
            DimensionType.STRING,
        );
    });

    it('should convert DATE metric type to DATE dimension type', () => {
        const mockItem = {
            ...baseMetric,
            type: MetricType.DATE,
        };
        expect(convertItemTypeToDimensionType(mockItem)).toEqual(
            DimensionType.DATE,
        );
    });

    it('should convert TIMESTAMP metric type to TIMESTAMP dimension type', () => {
        const mockItem = {
            ...baseMetric,
            type: MetricType.TIMESTAMP,
        };
        expect(convertItemTypeToDimensionType(mockItem)).toEqual(
            DimensionType.TIMESTAMP,
        );
    });

    it('should convert BOOLEAN metric type to BOOLEAN dimension type', () => {
        const mockItem = {
            ...baseMetric,
            type: MetricType.BOOLEAN,
        };
        expect(convertItemTypeToDimensionType(mockItem)).toEqual(
            DimensionType.BOOLEAN,
        );
    });

    it('should convert NUMBER metric type to NUMBER dimension type', () => {
        const mockItem = {
            ...baseMetric,
            type: MetricType.NUMBER,
        };
        expect(convertItemTypeToDimensionType(mockItem)).toEqual(
            DimensionType.NUMBER,
        );
    });

    it('should handle dimension types directly', () => {
        const dimensionTypes = [
            DimensionType.STRING,
            DimensionType.NUMBER,
            DimensionType.DATE,
            DimensionType.TIMESTAMP,
            DimensionType.BOOLEAN,
        ];

        dimensionTypes.forEach((dimensionType) => {
            const mockItem = {
                ...baseDimension,
                type: dimensionType,
            };
            expect(convertItemTypeToDimensionType(mockItem)).toEqual(
                dimensionType,
            );
        });
    });
});
