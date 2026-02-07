import { MetricType } from '../types/field';
import { isNumericType } from './item';

describe('isNumericType', () => {
    it('should return true for VARIANCE metric type', () => {
        expect(isNumericType(MetricType.VARIANCE)).toBe(true);
    });

    it('should return true for STANDARD_DEVIATION metric type', () => {
        expect(isNumericType(MetricType.STANDARD_DEVIATION)).toBe(true);
    });

    it('should return true for other numeric metric types', () => {
        expect(isNumericType(MetricType.AVERAGE)).toBe(true);
        expect(isNumericType(MetricType.SUM)).toBe(true);
        expect(isNumericType(MetricType.COUNT)).toBe(true);
    });

    it('should return false for non-numeric types', () => {
        expect(isNumericType(MetricType.STRING)).toBe(false);
        expect(isNumericType(MetricType.DATE)).toBe(false);
        expect(isNumericType(MetricType.BOOLEAN)).toBe(false);
    });
});
