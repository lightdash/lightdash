import { z } from 'zod';
import { DimensionType, MetricType } from '../../../types/field';

const dimensionTypeSchema = z.nativeEnum(DimensionType);
const metricTypeSchema = z.nativeEnum(MetricType);

const fieldTypeSchema = z.union([dimensionTypeSchema, metricTypeSchema]);

export default fieldTypeSchema;
