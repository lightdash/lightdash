import { getBasicType } from './catalog';
import { MetricType, type CompiledMetric } from './field';

describe('getBasicType', () => {
    it('should return "number" for VARIANCE metric type', () => {
        const mockMetric = {
            type: MetricType.VARIANCE,
        } as unknown as CompiledMetric;
        expect(getBasicType(mockMetric)).toEqual('number');
    });

    it('should return "number" for STANDARD_DEVIATION metric type', () => {
        const mockMetric = {
            type: MetricType.STANDARD_DEVIATION,
        } as unknown as CompiledMetric;
        expect(getBasicType(mockMetric)).toEqual('number');
    });

    it('should return "number" for other numeric metric types', () => {
        const numericMetrics = [
            MetricType.AVERAGE,
            MetricType.COUNT,
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
            const mockMetric = {
                type: metricType,
            } as unknown as CompiledMetric;
            expect(getBasicType(mockMetric)).toEqual('number');
        });
    });

    it('should return "string" for STRING metric type', () => {
        const mockMetric = {
            type: MetricType.STRING,
        } as unknown as CompiledMetric;
        expect(getBasicType(mockMetric)).toEqual('string');
    });

    it('should return "date" for DATE metric type', () => {
        const mockMetric = {
            type: MetricType.DATE,
        } as unknown as CompiledMetric;
        expect(getBasicType(mockMetric)).toEqual('date');
    });

    it('should return "timestamp" for TIMESTAMP metric type', () => {
        const mockMetric = {
            type: MetricType.TIMESTAMP,
        } as unknown as CompiledMetric;
        expect(getBasicType(mockMetric)).toEqual('timestamp');
    });

    it('should return "boolean" for BOOLEAN metric type', () => {
        const mockMetric = {
            type: MetricType.BOOLEAN,
        } as unknown as CompiledMetric;
        expect(getBasicType(mockMetric)).toEqual('boolean');
    });

    it('should return "number" for NUMBER metric type', () => {
        const mockMetric = {
            type: MetricType.NUMBER,
        } as unknown as CompiledMetric;
        expect(getBasicType(mockMetric)).toEqual('number');
    });
});
