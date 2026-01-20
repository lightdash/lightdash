import { CompileError } from '../types/errors';
import { type Table } from '../types/explore';
import { type Metric } from '../types/field';

/**
 * Validates that spotlight.filter_by and spotlight.segment_by reference existing dimensions
 */
export const validateSpotlightDimensionRefs = (
    metric: Metric,
    tables: Record<string, Table>,
): void => {
    const currentTable = tables[metric.table];
    if (!currentTable) return;

    const validateRefs = (refs: string[] | undefined, propertyName: string) => {
        if (!refs) return;
        refs.forEach((dimName) => {
            if (!currentTable.dimensions[dimName]) {
                throw new CompileError(
                    `Metric "${metric.name}" has spotlight.${propertyName} reference to unknown dimension: "${dimName}"`,
                );
            }
        });
    };

    validateRefs(metric.spotlight?.filterBy, 'filter_by');
    validateRefs(metric.spotlight?.segmentBy, 'segment_by');
};
