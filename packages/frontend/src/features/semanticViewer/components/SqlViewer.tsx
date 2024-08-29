import { Box, LoadingOverlay } from '@mantine/core';
import { Prism } from '@mantine/prism';
import { type FC } from 'react';
import { useSemanticLayerSql } from '../api/hooks';
import { useAppSelector } from '../store/hooks';
import {
    selectAllSelectedFieldsByKind,
    selectFilters,
    selectSemanticLayerInfo,
} from '../store/selectors';

const SqlViewer: FC = () => {
    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);

    const { sortBy, limit } = useAppSelector((state) => state.semanticViewer);

    const filters = useAppSelector(selectFilters);

    const allSelectedFieldsByKind = useAppSelector(
        selectAllSelectedFieldsByKind,
    );

    const sql = useSemanticLayerSql(
        {
            projectUuid,
            query: {
                ...allSelectedFieldsByKind,
                sortBy,
                limit,
                filters,
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
        <Box pos="relative" h="100%">
            <LoadingOverlay
                visible={sql.isFetching}
                opacity={1}
                loaderProps={{ color: 'gray', size: 'sm' }}
            />

            <Prism m={0} radius={0} language="sql" withLineNumbers>
                {sql.data ?? ''}
            </Prism>
        </Box>
    );
};

export default SqlViewer;
