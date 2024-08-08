import { Box, LoadingOverlay } from '@mantine/core';
import { Prism } from '@mantine/prism';
import { type FC } from 'react';
import { useSemanticLayerSql } from '../api/hooks';
import { useAppSelector } from '../store/hooks';

const SqlViewer: FC = () => {
    const { projectUuid, selectedDimensions, selectedMetrics } = useAppSelector(
        (state) => state.semanticViewer,
    );

    const sql = useSemanticLayerSql(
        {
            projectUuid,
            payload: {
                dimensions: selectedDimensions,
                metrics: selectedMetrics,
                timeDimensions: [],
            },
        },
        {
            keepPreviousData: true,
        },
    );

    if (sql.isError) {
        throw sql.error;
    }

    return (
        <Box pos="relative">
            <LoadingOverlay
                visible={sql.isFetching}
                overlayBlur={2}
                loaderProps={{ color: 'gray', size: 'sm' }}
            />

            <Prism m={0} radius={0} language="sql" withLineNumbers>
                {sql.data ?? ''}
            </Prism>
        </Box>
    );
};

export default SqlViewer;
