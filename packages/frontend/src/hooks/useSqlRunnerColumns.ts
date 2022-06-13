import {
    ApiQueryResults,
    CompiledDimension,
    fieldId,
    FieldId,
    getResultColumnTotals,
    isNumericItem,
} from '@lightdash/common';
import { useMemo } from 'react';

type Args = {
    resultsData: ApiQueryResults;
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
            return Object.values(fieldsMap).map((dimension) => ({
                Header: dimension.label,
                accessor: fieldId(dimension),
                type: 'dimension',
                Cell: ({
                    value: {
                        value: { raw },
                    },
                }: any) => {
                    if (raw === null) return '∅';
                    if (raw === undefined) return '-';
                    if (raw instanceof Date) return raw.toISOString();
                    return `${raw}`;
                },
                Footer: () => {
                    return totals[fieldId(dimension)]
                        ? totals[fieldId(dimension)]
                        : null;
                },
            }));
        }
        return [];
    }, [fieldsMap, totals]);
};

export default useSqlRunnerColumns;
