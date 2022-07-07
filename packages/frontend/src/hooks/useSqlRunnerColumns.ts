import {
    ApiQueryResults,
    CompiledDimension,
    FieldId,
    fieldId as getFieldId,
    getResultColumnTotals,
    isNumericItem,
} from '@lightdash/common';
import { useMemo } from 'react';
import { TableColumn } from '../components/common/Table/types';

type Args = {
    resultsData: ApiQueryResults | undefined;
    fieldsMap: Record<FieldId, CompiledDimension>;
};

const useSqlRunnerColumns = ({ resultsData, fieldsMap }: Args) => {
    const totals = useMemo<Record<FieldId, number | undefined>>(() => {
        if (resultsData && fieldsMap) {
            return getResultColumnTotals(
                resultsData.rows,
                Object.values(fieldsMap).filter((field) =>
                    isNumericItem(field),
                ),
            );
        }
        return {};
    }, [fieldsMap, resultsData]);

    return useMemo(() => {
        if (fieldsMap) {
            return Object.values(fieldsMap).map<TableColumn>((dimension) => {
                const fieldId = getFieldId(dimension);
                return {
                    id: fieldId,
                    header: dimension.label,
                    accessorKey: fieldId,
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
                };
            });
        }
        return [];
    }, [fieldsMap, totals]);
};

export default useSqlRunnerColumns;
