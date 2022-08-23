import {
    ApiQueryResults,
    Field,
    formatItemValue,
    friendlyName,
    getItemId,
    isField,
    ResultRow,
    TableCalculation,
} from '@lightdash/common';
import {
    TableHeaderBoldLabel,
    TableHeaderLabelContainer,
    TableHeaderRegularLabel,
} from '../../components/common/Table/Table.styles';
import { TableColumn, TableHeader } from '../../components/common/Table/types';
import { getResultColumnTotalsFromItemsMap } from '../useColumnTotals';

type Args = {
    itemsMap: Record<string, Field | TableCalculation>;
    resultsData: ApiQueryResults;
    isColumnVisible: (key: string) => boolean;
    showTableNames: boolean;
};

const getDataAndColumns = ({
    itemsMap,
    resultsData,
    isColumnVisible,
    showTableNames,
}: Args): {
    rows: ResultRow[];
    columns: Array<TableHeader | TableColumn>;
    error?: string;
} => {
    const totals = getResultColumnTotalsFromItemsMap(
        resultsData.rows,
        itemsMap,
    );
    const columns = Object.values(itemsMap).reduce<
        Array<TableHeader | TableColumn>
    >((acc, item) => {
        const itemId = getItemId(item);
        if (!isColumnVisible(itemId)) {
            return acc;
        }

        const column: TableHeader | TableColumn = {
            id: itemId,
            header: () => (
                <TableHeaderLabelContainer>
                    {isField(item) ? (
                        <>
                            {showTableNames && (
                                <TableHeaderRegularLabel>
                                    {item.tableLabel} -{' '}
                                </TableHeaderRegularLabel>
                            )}

                            <TableHeaderBoldLabel>
                                {item.label}
                            </TableHeaderBoldLabel>
                        </>
                    ) : (
                        <TableHeaderBoldLabel>
                            {item.displayName || friendlyName(item.name)}
                        </TableHeaderBoldLabel>
                    )}
                </TableHeaderLabelContainer>
            ),
            accessorKey: itemId,
            cell: (info: any) => info.getValue()?.value.formatted || '-',
            footer: () =>
                totals[itemId] ? formatItemValue(item, totals[itemId]) : null,
            meta: {
                item,
            },
        };
        return [...acc, column];
    }, []);
    return {
        rows: resultsData.rows,
        columns,
    };
};

export default getDataAndColumns;
