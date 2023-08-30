import { Field, fieldId as getFieldId } from '@lightdash/common';
import {
    columnHelper,
    TableColumn,
} from '../../../components/common/Table/types';

export default function convertFieldMapToTableColumns(
    fieldsMap: Record<string, Field>,
) {
    return Object.values(fieldsMap).map<TableColumn>((field) => {
        const fieldId = getFieldId(field);
        return columnHelper.accessor((row) => row[fieldId], {
            id: fieldId,
            header: () => field.label,
            cell: (info) => {
                const {
                    value: { raw },
                } = info.getValue();
                if (raw === null) return '∅';
                if (raw === undefined) return '-';
                if (raw instanceof Date) return raw.toISOString();
                return `${raw}`;
            },
            meta: {
                item: field,
            },
        });
    });
}
