import {
    ApiQueryResults,
    Field,
    FieldId,
    getResultColumnTotals,
    isNumericItem,
    TableCalculation,
} from '@lightdash/common';
import { useMemo } from 'react';

type Args = {
    resultsData: ApiQueryResults | undefined;
    itemsMap: Record<FieldId, Field | TableCalculation>;
};

const useColumnTotals = ({ resultsData, itemsMap }: Args) => {
    return useMemo<Record<FieldId, number | undefined>>(() => {
        if (resultsData) {
            return getResultColumnTotals(
                resultsData.rows,
                Object.values(itemsMap).filter((field) => isNumericItem(field)),
            );
        }
        return {};
    }, [itemsMap, resultsData]);
};

export default useColumnTotals;
