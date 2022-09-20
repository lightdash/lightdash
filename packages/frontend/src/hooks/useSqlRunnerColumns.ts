import {
    ApiQueryResults,
    Field,
    FieldId,
    fieldId as getFieldId,
} from '@lightdash/common';
import { useMemo } from 'react';
import { columnHelper, TableColumn } from '../components/common/Table/types';
import useColumnTotals from './useColumnTotals';

type Args = {
    resultsData: ApiQueryResults | undefined;
    fieldsMap: Record<FieldId, Field>;
    columnHeader?: (dimension: Field) => JSX.Element;
};

const useSqlRunnerColumns = ({
    resultsData,
    fieldsMap,
    columnHeader,
}: Args) => {
    const totals = useColumnTotals({ resultsData, itemsMap: fieldsMap });

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
                        const {
                            value: { raw },
                        } = info.getValue();
                        if (raw === null) return '∅';
                        if (raw === undefined) return '-';
                        if (raw instanceof Date) return raw.toISOString();
                        return `${raw}`;
                    },
                    footer: () => (totals[fieldId] ? totals[fieldId] : null),
                    meta: {
                        item: dimension,
                    },
                });
            });
        }
        return [];
    }, [fieldsMap, totals, columnHeader]);
};

export default useSqlRunnerColumns;
