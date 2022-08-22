import {
    ApiQueryResults,
    Field,
    FieldId,
    fieldId as getFieldId,
    formatItemValue,
} from '@lightdash/common';
import { useMemo } from 'react';
import { TableColumn } from '../components/common/Table/types';
import useColumnTotals from './useColumnTotals';

type Args = {
    resultsData: ApiQueryResults | undefined;
    fieldsMap: Record<FieldId, Field>;
    columnHeader?: (dimension: Field) => JSX.Element;
};

const useUnderlyingDataColumns = ({
    resultsData,
    fieldsMap,
    columnHeader,
}: Args) => {
    const totals = useColumnTotals({ resultsData, itemsMap: fieldsMap });

    return useMemo(() => {
        if (fieldsMap) {
            return Object.values(fieldsMap).map<TableColumn>((dimension) => {
                const fieldId = getFieldId(dimension);
                return {
                    id: fieldId,
                    header: () =>
                        columnHeader !== undefined
                            ? columnHeader(dimension)
                            : dimension.label,
                    accessorKey: fieldId,
                    cell: (info: any) =>
                        info.getValue()?.value.formatted || '-',
                    footer: () =>
                        totals[fieldId]
                            ? formatItemValue(dimension, totals[fieldId])
                            : null,
                    meta: {
                        item: dimension,
                    },
                };
            });
        }
        return [];
    }, [fieldsMap, totals, columnHeader]);
};

export default useUnderlyingDataColumns;
