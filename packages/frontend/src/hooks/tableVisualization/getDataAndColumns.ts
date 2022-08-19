import {
    ApiQueryResults,
    Field,
    formatItemValue,
    getItemId,
    ResultRow,
    TableCalculation,
} from '@lightdash/common';
import { TableColumn, TableHeader } from '../../components/common/Table/types';
import { getResultColumnTotalsFromItemsMap } from '../useColumnTotals';

type Args = {
    itemsMap: Record<string, Field | TableCalculation>;
    resultsData: ApiQueryResults;
    isColumnVisible: (key: string) => boolean;
    getHeader: (key: string) => string | undefined;
    getDefaultColumnLabel: (key: string) => string;
};

const getDataAndColumns = ({
    itemsMap,
    resultsData,
    isColumnVisible,
    getHeader,
    getDefaultColumnLabel,
}: Args): {
    rows: ResultRow[];
    columns: Array<TableHeader | TableColumn>;
    error?: string;
} => {
    const totals = getResultColumnTotalsFromItemsMap(
        resultsData.rows,
        itemsMap,
    );
    const columns = Object.values(itemsMap).reduce<TableColumn[]>(
        (acc, item) => {
            const itemId = getItemId(item);
            if (!isColumnVisible(itemId)) {
                return acc;
            }
            const column: TableColumn = {
                id: itemId,
                header: getHeader(itemId) || getDefaultColumnLabel(itemId),
                accessorKey: itemId,
                cell: (info: any) => info.getValue()?.value.formatted || '-',
                footer: () =>
                    totals[itemId]
                        ? formatItemValue(item, totals[itemId])
                        : null,
                meta: {
                    item,
                },
            };
            return [...acc, column];
        },
        [],
    );
    return {
        rows: resultsData.rows,
        columns,
    };
};

export default getDataAndColumns;
