import { Box, getDefaultZIndex, LoadingOverlay } from '@mantine/core';
import { Prism } from '@mantine/prism';
import { type FC } from 'react';
import { useSemanticLayerSql } from '../api/hooks';
import { useAppSelector } from '../store/hooks';
import {
    selectAllSelectedFieldNames,
    selectSemanticLayerInfo,
    selectSemanticLayerQuery,
} from '../store/selectors';

const SqlViewer: FC = () => {
    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);
    const semanticQuery = useAppSelector(selectSemanticLayerQuery);
    const selectedFields = useAppSelector(selectAllSelectedFieldNames);

    const sql = useSemanticLayerSql(
        { projectUuid, query: semanticQuery },
        { keepPreviousData: true, enabled: selectedFields.length !== 0 },
    );

    if (sql.isError) {
        throw sql.error;
    }

    return (
        <Box pos="relative" h="100%" w="100%" sx={{ overflow: 'auto' }}>
            <LoadingOverlay
                visible={sql.isFetching}
                opacity={1}
                zIndex={getDefaultZIndex('modal') - 1}
                loaderProps={{ color: 'gray', size: 'sm' }}
            />

            <Prism m={0} radius={0} language="sql" withLineNumbers>
                {sql.data ?? ''}
            </Prism>
        </Box>
    );
};

export default SqlViewer;
