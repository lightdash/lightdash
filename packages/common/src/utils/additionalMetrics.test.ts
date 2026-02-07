import { DimensionType, MetricType } from '../types/field';
import { getCustomMetricType } from './additionalMetrics';

describe('getCustomMetricType', () => {
    describe('NUMBER dimension type', () => {
        it('should include VARIANCE in returned metric types', () => {
            const metricTypes = getCustomMetricType(DimensionType.NUMBER);
            expect(metricTypes).toContain(MetricType.VARIANCE);
        });

        it('should include STANDARD_DEVIATION in returned metric types', () => {
            const metricTypes = getCustomMetricType(DimensionType.NUMBER);
            expect(metricTypes).toContain(MetricType.STANDARD_DEVIATION);
        });

        it('should include other numeric metric types', () => {
            const metricTypes = getCustomMetricType(DimensionType.NUMBER);
            expect(metricTypes).toContain(MetricType.AVERAGE);
            expect(metricTypes).toContain(MetricType.SUM);
            expect(metricTypes).toContain(MetricType.MIN);
            expect(metricTypes).toContain(MetricType.MAX);
        });
    });

    describe('STRING dimension type', () => {
        it('should NOT include VARIANCE in returned metric types', () => {
            const metricTypes = getCustomMetricType(DimensionType.STRING);
            expect(metricTypes).not.toContain(MetricType.VARIANCE);
        });

        it('should NOT include STANDARD_DEVIATION in returned metric types', () => {
            const metricTypes = getCustomMetricType(DimensionType.STRING);
            expect(metricTypes).not.toContain(MetricType.STANDARD_DEVIATION);
        });
    });

    describe('BOOLEAN dimension type', () => {
        it('should NOT include VARIANCE in returned metric types', () => {
            const metricTypes = getCustomMetricType(DimensionType.BOOLEAN);
            expect(metricTypes).not.toContain(MetricType.VARIANCE);
        });

        it('should NOT include STANDARD_DEVIATION in returned metric types', () => {
            const metricTypes = getCustomMetricType(DimensionType.BOOLEAN);
            expect(metricTypes).not.toContain(MetricType.STANDARD_DEVIATION);
        });
    });

    describe('DATE dimension type', () => {
        it('should NOT include VARIANCE in returned metric types', () => {
            const metricTypes = getCustomMetricType(DimensionType.DATE);
            expect(metricTypes).not.toContain(MetricType.VARIANCE);
        });

        it('should NOT include STANDARD_DEVIATION in returned metric types', () => {
            const metricTypes = getCustomMetricType(DimensionType.DATE);
            expect(metricTypes).not.toContain(MetricType.STANDARD_DEVIATION);
        });
    });
});
