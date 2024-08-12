import { type ResultRow, type SqlTableConfig } from '@lightdash/common';
import { Box, LoadingOverlay } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { Table } from '../../sqlRunner/components/visualizations/Table';
import { useSemanticViewerQueryRun } from '../api/streamingResults';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setResults } from '../store/semanticViewerSlice';

const sanitizeFieldId = (fieldId: string) => fieldId.replace('.', '_');
const ResultsViewer: FC = () => {
    const {
        projectUuid,
        selectedDimensions,
        selectedTimeDimensions,
        selectedMetrics,
        results,
    } = useAppSelector((state) => state.semanticViewer);
    const dispatch = useAppDispatch();

    const { mutate: runSemanticViewerQuery, isLoading } =
        useSemanticViewerQueryRun({
            onSuccess: (data) => {
                if (data) {
                    const resultRows: ResultRow[] = data.results.map(
                        (result) => {
                            return Object.entries(result).reduce(
                                (acc, entry) => {
                                    const [key, resultValue] = entry;
                                    return {
                                        ...acc,
                                        [sanitizeFieldId(key)]: {
                                            value: {
                                                raw: resultValue,
                                                formatted:
                                                    resultValue?.toString(),
                                            },
                                        },
                                    };
                                },
                                {},
                            );
                        },
                    );
                    dispatch(setResults(resultRows));
                }
            },
        });

    const config: SqlTableConfig = useMemo(() => {
        const columns = [
            ...selectedTimeDimensions,
            ...selectedDimensions,
            ...selectedMetrics,
        ].reduce((acc, dimension) => {
            return {
                ...acc,
                [sanitizeFieldId(dimension)]: {
                    visible: true,
                    reference: sanitizeFieldId(dimension),
                    label: dimension,
                    frozen: false,
                    order: undefined,
                },
            };
        }, {});
        return { columns };
    }, [selectedDimensions, selectedTimeDimensions, selectedMetrics]);
    return (
        <Box pos="relative">
            <LoadingOverlay
                visible={isLoading}
                overlayBlur={2}
                loaderProps={{ color: 'gray', size: 'sm' }}
            />
            <button
                onClick={() =>
                    runSemanticViewerQuery({
                        projectUuid,
                        query: {
                            dimensions: selectedDimensions,
                            metrics: selectedMetrics,
                            timeDimensions: selectedTimeDimensions,
                        },
                    })
                }
            >
                Run Query{' '}
            </button>
            {results && <Table data={results} config={config} />}
        </Box>
    );
};

export default ResultsViewer;
