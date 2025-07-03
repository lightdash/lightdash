import { z } from 'zod';
import { DimensionType, MetricType } from '../../../types/field';

const dimensionTypeSchema = z.union([
    z.literal(DimensionType.BOOLEAN),
    z.literal(DimensionType.DATE),
    z.literal(DimensionType.NUMBER),
    z.literal(DimensionType.STRING),
    z.literal(DimensionType.TIMESTAMP),
]);

const metricTypeSchema = z.union([
    z.literal(MetricType.PERCENTILE),
    z.literal(MetricType.AVERAGE),
    z.literal(MetricType.COUNT),
    z.literal(MetricType.COUNT_DISTINCT),
    z.literal(MetricType.SUM),
    z.literal(MetricType.MIN),
    z.literal(MetricType.MAX),
    z.literal(MetricType.NUMBER),
    z.literal(MetricType.MEDIAN),
    z.literal(MetricType.STRING),
    z.literal(MetricType.DATE),
    z.literal(MetricType.TIMESTAMP),
    z.literal(MetricType.BOOLEAN),
]);

const fieldTypeSchema = z.union([dimensionTypeSchema, metricTypeSchema]);

export default fieldTypeSchema;
