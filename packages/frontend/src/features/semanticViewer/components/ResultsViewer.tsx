import { Box, LoadingOverlay } from '@mantine/core';
import { type FC } from 'react';
import { useSemanticViewerQueryRun } from '../api/streamingResults';
import { useAppSelector } from '../store/hooks';

const ResultsViewer: FC = () => {
    const {
        projectUuid,
        selectedDimensions,
        selectedTimeDimensions,
        selectedMetrics,
    } = useAppSelector((state) => state.semanticViewer);

    const { mutate: runSemanticViewerQuery, isLoading } =
        useSemanticViewerQueryRun({
            onSuccess: (data) => {
                if (data) {
                    //  dispatch(setSqlRunnerResults(data));
                }
            },
        });

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
                {' '}
                Run Query{' '}
            </button>
        </Box>
    );
};

export default ResultsViewer;
