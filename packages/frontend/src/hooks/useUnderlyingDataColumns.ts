import {
    formatItemValue,
    getItemId,
    type ApiQueryResults,
    type Field,
    type FieldId,
} from '@lightdash/common';
import { useMemo } from 'react';
import {
    columnHelper,
    type TableColumn,
} from '../components/common/Table/types';
import { getFormattedValueCell } from './useColumns';
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
                const fieldId = getItemId(dimension);
                return columnHelper.accessor((row) => row[fieldId], {
                    id: fieldId,
                    header: () =>
                        columnHeader !== undefined
                            ? columnHeader(dimension)
                            : dimension.label,
                    cell: getFormattedValueCell,
                    footer: () =>
                        totals[fieldId]
                            ? formatItemValue(dimension, totals[fieldId])
                            : null,
                    meta: {
                        item: dimension,
                    },
                });
            });
        }
        return [];
    }, [fieldsMap, totals, columnHeader]);
};

export default useUnderlyingDataColumns;
