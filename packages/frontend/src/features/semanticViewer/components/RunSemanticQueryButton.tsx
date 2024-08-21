import { type ResultRow, type SemanticLayerResultRow } from '@lightdash/common';
import { useEffect, type FC } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import { useSemanticViewerQueryRun } from '../api/streamingResults';
import { useAppDispatch, useAppSelector } from '../store/hooks';

import { onResults } from '../../../components/DataViz/store/cartesianChartBaseSlice';
import {
    selectAllSelectedFieldNames,
    selectAllSelectedFieldsByKind,
} from '../store/selectors';
import { setResults } from '../store/semanticViewerSlice';
import RunQueryButton from './RunSqlQueryButton';

const mapResultsToTableData = (
    resultRows: SemanticLayerResultRow[],
): ResultRow[] => {
    return resultRows.map((result) => {
        return Object.entries(result).reduce((acc, entry) => {
            const [key, resultValue] = entry;
            return {
                ...acc,
                [key]: {
                    value: {
                        raw: resultValue,
                        formatted: resultValue?.toString(),
                    },
                },
            };
        }, {});
    });
};

export const RunSemanticQueryButton: FC = () => {
    const { showToastError } = useToaster();

    const allSelectedFields = useAppSelector(selectAllSelectedFieldNames);
    const { projectUuid, columns, sortBy } = useAppSelector(
        (state) => state.semanticViewer,
    );
    const allSelectedFieldsByKind = useAppSelector(
        selectAllSelectedFieldsByKind,
    );
    const dispatch = useAppDispatch();

    const {
        data: resultsData,
        mutateAsync: runSemanticViewerQuery,
        isLoading,
    } = useSemanticViewerQueryRun({
        select: (data) => {
            if (!data) return undefined;
            return mapResultsToTableData(data);
        },
        onError: (data) => {
            showToastError({
                title: 'Could not fetch SQL query results',
                subtitle: data.error.message,
            });
        },
    });

    useEffect(() => {
        if (resultsData) {
            const usedColumns = columns.filter((c) =>
                allSelectedFields.includes(c.reference),
            );
            dispatch(
                setResults({
                    results: resultsData,
                    columns: usedColumns,
                }),
            );

            dispatch(
                onResults({
                    results: resultsData,
                    columns: usedColumns,
                }),
            );
        }
    }, [resultsData, columns, dispatch, allSelectedFields]);

    return (
        <RunQueryButton
            //disabled={selectedTimeDimensions.length === 0}
            //limit={limit}
            onSubmit={() =>
                runSemanticViewerQuery({
                    projectUuid,
                    query: {
                        ...allSelectedFieldsByKind,
                        sortBy,
                    },
                })
            }
            isLoading={isLoading} /*onLimitChange={(newLimit) => {
            dispatch(setSqlLimit(newLimit));
            handleRunQuery(newLimit);
        }}*/
        />
    );
};
