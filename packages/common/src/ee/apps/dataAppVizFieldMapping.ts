import { isField, type ItemsMap } from '../../types/field';
import {
    getDataAppVizFieldIds,
    type DataAppVizFieldMapping,
} from '../../types/savedCharts';
import { getCustomFormat } from '../../utils/formatting';
import { getItemLabelWithoutTableName } from '../../utils/item';
import { type DataAppVizFieldMetadata } from './types';

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
