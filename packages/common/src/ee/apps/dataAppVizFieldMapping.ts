import { isField, type ItemsMap } from '../../types/field';
import { type DataAppVizFieldMapping } from '../../types/savedCharts';
import { getCustomFormat } from '../../utils/formatting';
import { getItemLabelWithoutTableName } from '../../utils/item';
import { type DataAppVizFieldMetadata } from './types';

/** Normalize one binding for consumers that handle either cardinality. */
export const getDataAppVizFieldIds = (
    value: string | string[] | undefined,
): string[] =>
    typeof value === 'string' ? [value] : [...new Set(value ?? [])];

/** Display metadata for every bound field id the items map can describe. */
export const deriveDataAppVizFieldMetadata = (
    fieldMapping: DataAppVizFieldMapping,
    itemsMap: ItemsMap,
): Record<string, DataAppVizFieldMetadata> =>
    Object.fromEntries(
        Object.values(fieldMapping)
            .flatMap(getDataAppVizFieldIds)
            .flatMap((fieldId) => {
                const item = itemsMap[fieldId];
                if (!item) return [];
                const format = getCustomFormat(item);
                const metadata: DataAppVizFieldMetadata = {
                    label: getItemLabelWithoutTableName(item),
                    ...(isField(item) ? { tableLabel: item.tableLabel } : {}),
                    ...(format ? { format } : {}),
                };
                return [[fieldId, metadata] as const];
            }),
    );
