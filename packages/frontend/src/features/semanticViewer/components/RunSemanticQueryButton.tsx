import { type ResultRow, type SemanticLayerResultRow } from '@lightdash/common';
import { useEffect, useMemo, type FC } from 'react';
import { onResults } from '../../../components/DataViz/store/cartesianChartBaseSlice';
import useToaster from '../../../hooks/toaster/useToaster';
import { useSemanticLayerQueryResults } from '../api/hooks';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    selectAllSelectedFieldNames,
    selectAllSelectedFieldsByKind,
} from '../store/selectors';
import { setResults } from '../store/semanticViewerSlice';
import { SemanticViewerResultsTransformer } from '../transformers/SemanticViewerResultsTransformer';
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
        data: semanticLayerResultRows,
        mutateAsync: runSemanticViewerQuery,
        isLoading,
    } = useSemanticLayerQueryResults(projectUuid, {
        onError: (data) => {
            showToastError({
                title: 'Could not fetch SQL query results',
                subtitle: data.error.message,
            });
        },
    });

    const resultsData = useMemo(() => {
        if (semanticLayerResultRows) {
            return mapResultsToTableData(semanticLayerResultRows);
        }
    }, [semanticLayerResultRows]);

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
                    transformer: new SemanticViewerResultsTransformer({
                        rows: resultsData,
                        columns: usedColumns,
                        query: {
                            ...allSelectedFieldsByKind,
                            sortBy,
                        },
                        projectUuid,
                    }),
                }),
            );
        }
    }, [
        resultsData,
        columns,
        dispatch,
        allSelectedFields,
        allSelectedFieldsByKind,
        projectUuid,
        sortBy,
    ]);

    return (
        <RunQueryButton
            //disabled={selectedTimeDimensions.length === 0}
            //limit={limit}
            onSubmit={() =>
                runSemanticViewerQuery({
                    ...allSelectedFieldsByKind,
                    sortBy,
                })
            }
            isLoading={isLoading} /*onLimitChange={(newLimit) => {
            dispatch(setSqlLimit(newLimit));
            handleRunQuery(newLimit);
        }}*/
        />
    );
};
