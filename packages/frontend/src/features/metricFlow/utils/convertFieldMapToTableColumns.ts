import { getItemId, getItemLabel, type ItemsMap } from '@lightdash/common';
import {
    columnHelper,
    type TableColumn,
} from '../../../components/common/Table/types';

export default function convertFieldMapToTableColumns(itemsMap: ItemsMap) {
    return Object.values(itemsMap).map<TableColumn>((item) => {
        const fieldId = getItemId(item);
        return columnHelper.accessor((row) => row[fieldId], {
            id: fieldId,
            header: () => getItemLabel(item),
            cell: (info) => {
                const raw = info.getValue()?.value.raw;
                if (raw === null) return '∅';
                if (raw === undefined) return '-';
                if (raw instanceof Date) return raw.toISOString();
                return `${raw}`;
            },
            meta: {
                item,
            },
        });
    });
}
