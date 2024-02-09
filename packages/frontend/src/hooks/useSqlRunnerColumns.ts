import { Field, FieldId, fieldId as getFieldId } from '@lightdash/common';
import { useMemo } from 'react';
import { columnHelper, TableColumn } from '../components/common/Table/types';

type Args = {
    fieldsMap: Record<FieldId, Field> | undefined;
    columnHeader?: (dimension: Field) => JSX.Element;
};

const useSqlRunnerColumns = ({ fieldsMap, columnHeader }: Args) => {
    return useMemo(() => {
        if (fieldsMap) {
            return Object.values(fieldsMap).map<TableColumn>((dimension) => {
                const fieldId = getFieldId(dimension);
                return columnHelper.accessor((row) => row[fieldId], {
                    id: fieldId,
                    header: () =>
                        columnHeader !== undefined
                            ? columnHeader(dimension)
                            : dimension.label,
                    cell: (info) => {
                        let raw;
                        try {
                            raw = info.getValue().value.raw;
                        } catch {
                            console.error(
                                'Error getting cell data for field',
                                fieldId,
                            );
                            return 'Error';
                        }
                        if (raw === null) return '∅';
                        if (raw === undefined) return '-';
                        if (raw instanceof Date) return raw.toISOString();
                        return `${raw}`;
                    },
                    meta: {
                        item: dimension,
                    },
                });
            });
        }
        return [];
    }, [fieldsMap, columnHeader]);
};

export default useSqlRunnerColumns;
