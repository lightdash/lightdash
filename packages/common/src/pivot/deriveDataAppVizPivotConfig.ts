import { getDataAppVizFieldIds } from '../ee/apps/dataAppVizFieldMapping';
import type { DataAppVizField } from '../ee/apps/types';
import type { DataAppVizFieldMapping, SavedChart } from '../types/savedCharts';

/**
 * Converts a reusable custom chart's semantic field contract into the
 * lightweight pivot state persisted with a chart. Keeping this pure makes the
 * integration removable from callers without coupling schema knowledge to
 * Explorer state updates.
 */
export const deriveDataAppVizPivotConfig = (
    fields: DataAppVizField[],
    fieldMapping: DataAppVizFieldMapping,
): SavedChart['pivotConfig'] => {
    const columns = fields.reduce<string[]>((mappedSeries, field) => {
        if (field.type === 'series') {
            for (const fieldId of getDataAppVizFieldIds(
                fieldMapping[field.name],
            )) {
                if (!mappedSeries.includes(fieldId)) {
                    mappedSeries.push(fieldId);
                }
            }
        }
        return mappedSeries;
    }, []);

    return columns.length > 0 ? { columns } : undefined;
};
