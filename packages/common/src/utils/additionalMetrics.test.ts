import { DimensionType, MetricType } from '../types/field';
import { getCustomMetricType } from './additionalMetrics';

describe('getCustomMetricType', () => {
    it('should return variance and standard deviation for NUMBER dimensions', () => {
        const result = getCustomMetricType(DimensionType.NUMBER);
        expect(result).toContain(MetricType.VARIANCE);
        expect(result).toContain(MetricType.STANDARD_DEVIATION);
    });

    it('should return all expected metrics for NUMBER dimensions', () => {
        const result = getCustomMetricType(DimensionType.NUMBER);
        expect(result).toEqual([
            MetricType.MIN,
            MetricType.MAX,
            MetricType.SUM,
            MetricType.PERCENTILE,
            MetricType.MEDIAN,
            MetricType.AVERAGE,
            MetricType.VARIANCE,
            MetricType.STANDARD_DEVIATION,
            MetricType.COUNT_DISTINCT,
            MetricType.COUNT,
        ]);
    });

    it('should NOT include variance and standard deviation for STRING dimensions', () => {
        const result = getCustomMetricType(DimensionType.STRING);
        expect(result).not.toContain(MetricType.VARIANCE);
        expect(result).not.toContain(MetricType.STANDARD_DEVIATION);
        expect(result).toEqual([
            MetricType.COUNT_DISTINCT,
            MetricType.COUNT,
            MetricType.MIN,
            MetricType.MAX,
        ]);
    });

    it('should NOT include variance and standard deviation for DATE dimensions', () => {
        const result = getCustomMetricType(DimensionType.DATE);
        expect(result).not.toContain(MetricType.VARIANCE);
        expect(result).not.toContain(MetricType.STANDARD_DEVIATION);
        expect(result).toEqual([
            MetricType.COUNT_DISTINCT,
            MetricType.COUNT,
            MetricType.MIN,
            MetricType.MAX,
        ]);
    });

    it('should NOT include variance and standard deviation for TIMESTAMP dimensions', () => {
        const result = getCustomMetricType(DimensionType.TIMESTAMP);
        expect(result).not.toContain(MetricType.VARIANCE);
        expect(result).not.toContain(MetricType.STANDARD_DEVIATION);
        expect(result).toEqual([
            MetricType.COUNT_DISTINCT,
            MetricType.COUNT,
            MetricType.MIN,
            MetricType.MAX,
        ]);
    });

    it('should NOT include variance and standard deviation for BOOLEAN dimensions', () => {
        const result = getCustomMetricType(DimensionType.BOOLEAN);
        expect(result).not.toContain(MetricType.VARIANCE);
        expect(result).not.toContain(MetricType.STANDARD_DEVIATION);
        expect(result).toEqual([MetricType.COUNT_DISTINCT, MetricType.COUNT]);
    });

    it('should return empty array for invalid dimension type', () => {
        // This test case covers the default case in the switch statement
        // Since TypeScript ensures we cover all enum values, this won't actually be called
        // but we include it for completeness
        const invalidType = 'invalid' as DimensionType;
        const result = getCustomMetricType(invalidType);
        expect(result).toEqual([]);
    });
});
