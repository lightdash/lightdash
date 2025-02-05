import {
    getItemId,
    type ApiQueryResults,
    type Field,
    type FieldId,
} from '@lightdash/common';
import { useMemo, type ReactNode } from 'react';
import {
    columnHelper,
    type TableColumn,
} from '../components/common/Table/types';
import useColumnTotals from './useColumnTotals';
import { getRawValueCell } from './useColumns';

type Args = {
    resultsData: ApiQueryResults | undefined;
    fieldsMap: Record<FieldId, Field>;
    columnHeader?: (dimension: Field) => ReactNode;
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
                const fieldId = getItemId(dimension);
                return columnHelper.accessor((row) => row[fieldId], {
                    id: fieldId,
                    header: () =>
                        columnHeader !== undefined
                            ? columnHeader(dimension)
                            : dimension.label,
                    cell: getRawValueCell,
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
