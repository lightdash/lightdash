import { Field, getFields } from '@lightdash/common';
import { useMemo } from 'react';
import { useExplorer } from '../providers/ExplorerProvider';
import { useExplore } from './useExplore';

export const useField = (
    fieldName: string,
    tableName: string,
): {
    isLoading: boolean;
    field: Field | undefined;
} => {
    const {
        state: {
            unsavedChartVersion: { tableName: activeTableName },
        },
    } = useExplorer();
    const { data, isLoading } = useExplore(activeTableName);
    const fields: Field[] = useMemo(
        () => (data ? getFields(data) : []),
        [data],
    );

    return {
        isLoading,
        field: fields.find(
            ({ name, table }) => name === fieldName && table === tableName,
        ),
    };
};
