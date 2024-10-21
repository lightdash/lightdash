import { Box, getDefaultZIndex, LoadingOverlay } from '@mantine/core';
import { Prism } from '@mantine/prism';
import { type FC } from 'react';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import useToaster from '../../../hooks/toaster/useToaster';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useSemanticLayerSql } from '../api/hooks';
import {
    selectAllSelectedFieldNames,
    selectSemanticLayerInfo,
    selectSemanticLayerQuery,
} from '../store/selectors';

const SqlViewer: FC = () => {
    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);
    const semanticQuery = useAppSelector(selectSemanticLayerQuery);
    const selectedFields = useAppSelector(selectAllSelectedFieldNames);
    const { showToastError } = useToaster();

    const sql = useSemanticLayerSql(
        { projectUuid, query: semanticQuery },
        { keepPreviousData: true, enabled: selectedFields.length !== 0 },
    );

    if (sql.isError) {
        showToastError({
            title: 'Failed to generate SQL',
        });
    }

    return (
        <Box pos="relative" h="100%" w="100%" sx={{ overflow: 'auto' }}>
            <LoadingOverlay
                visible={sql.isFetching}
                opacity={1}
                zIndex={getDefaultZIndex('modal') - 1}
                loaderProps={{ color: 'gray', size: 'sm' }}
            />

            {!sql.isError ? (
                <Prism m={0} radius={0} language="sql" withLineNumbers>
                    {sql.data ?? ''}
                </Prism>
            ) : (
                <SuboptimalState
                    title="Failed to generate SQL"
                    description={
                        sql.error.error.statusCode !== 500
                            ? sql.error.error.message
                            : 'There might be something wrong with the selected fields'
                    }
                />
            )}
        </Box>
    );
};

export default SqlViewer;
