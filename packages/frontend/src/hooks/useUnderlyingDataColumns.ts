import {
    formatItemValue,
    getItemId,
    getItemLabel,
    isField,
    type ApiQueryResults,
    type Field,
    type ItemsMap,
} from '@lightdash/common';
import { useMemo, type ReactNode } from 'react';
import {
    columnHelper,
    type TableColumn,
} from '../components/common/Table/types';
import useColumnTotals from './useColumnTotals';
import { getFormattedValueCell } from './useColumns';

type Args = {
    resultsData: ApiQueryResults | undefined;
    fieldsMap: ItemsMap;
    columnHeader?: (dimension: Field) => ReactNode;
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
                        columnHeader !== undefined && isField(dimension)
                            ? columnHeader(dimension)
                            : getItemLabel(dimension),
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
