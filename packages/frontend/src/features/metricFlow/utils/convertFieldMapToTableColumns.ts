import { getItemId, getItemLabel, type ItemsMap } from '@lightdash/common';
import {
    columnHelper,
    type TableColumn,
} from '../../../components/common/Table/types';
import { getRawValueCell } from '../../../hooks/useColumns';

export default function convertFieldMapToTableColumns(itemsMap: ItemsMap) {
    return Object.values(itemsMap).map<TableColumn>((item) => {
        const fieldId = getItemId(item);
        return columnHelper.accessor((row) => row[fieldId], {
            id: fieldId,
            header: () => getItemLabel(item),
            cell: getRawValueCell,
            meta: {
                item,
            },
        });
    });
}
