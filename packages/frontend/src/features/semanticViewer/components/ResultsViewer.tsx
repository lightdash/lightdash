import {
    type ResultRow,
    type SemanticLayerResultRow,
    type SqlTableConfig,
} from '@lightdash/common';
import { Box, Button, Center, LoadingOverlay, Overlay } from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import { isEqual } from 'lodash';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import useToaster from '../../../hooks/toaster/useToaster';
import { Table } from '../../sqlRunner/components/visualizations/Table';
import { useSemanticViewerQueryRun } from '../api/streamingResults';
import { useAppSelector } from '../store/hooks';
import {
    selectAllSelectedFields,
    selectSelectedFieldsByKind,
} from '../store/selectors';

const sanitizeFieldId = (fieldId: string) => fieldId.replace('.', '_');

const mapResultsToTableData = (
    resultRows: SemanticLayerResultRow[],
): ResultRow[] => {
    return resultRows.map((result) => {
        return Object.entries(result).reduce((acc, entry) => {
            const [key, resultValue] = entry;
            return {
                ...acc,
                [sanitizeFieldId(key)]: {
                    value: {
                        raw: resultValue,
                        formatted: resultValue?.toString(),
                    },
                },
            };
        }, {});
    });
};

const ResultsViewer: FC = () => {
    const { projectUuid } = useAppSelector((state) => state.semanticViewer);
    const selectedFieldsByKind = useAppSelector(selectSelectedFieldsByKind);
    const allSelectedFields = useAppSelector(selectAllSelectedFields);

    const { showToastError } = useToaster();

    const [lastQuery, setLastQuery] = useState<
        typeof selectedFieldsByKind | null
    >(null);

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

    const shouldRunNewQuery = useMemo(() => {
        if (!lastQuery) return true;
        return !isEqual(lastQuery, selectedFieldsByKind);
    }, [lastQuery, selectedFieldsByKind]);

    const handleRunQuery = useCallback(async () => {
        if (!shouldRunNewQuery) return;

        await runSemanticViewerQuery({
            projectUuid,
            query: selectedFieldsByKind,
        });

        setLastQuery(selectedFieldsByKind);
    }, [
        runSemanticViewerQuery,
        shouldRunNewQuery,
        projectUuid,
        selectedFieldsByKind,
    ]);

    const config: SqlTableConfig = useMemo(() => {
        const columns = allSelectedFields.reduce<SqlTableConfig['columns']>(
            (acc, dimension) => {
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
            },
            {},
        );
        return { columns };
    }, [allSelectedFields]);

    return (
        <Box pos="relative" h="100%">
            <LoadingOverlay
                visible={isLoading}
                overlayBlur={2}
                loaderProps={{ color: 'gray', size: 'sm' }}
            />

            {shouldRunNewQuery && (
                <Overlay blur={3} color="#fff" opacity={0.33}>
                    <Center h="100%">
                        <Button
                            size="xs"
                            leftIcon={<MantineIcon icon={IconPlayerPlay} />}
                            loading={isLoading}
                            onClick={handleRunQuery}
                        >
                            Run query
                        </Button>
                    </Center>
                </Overlay>
            )}

            {resultsData && (
                <Box h="100%">
                    {/* TODO: dummy fix for table header stretching vertically */}
                    <Box>
                        <Table data={resultsData} config={config} />
                    </Box>
                </Box>
            )}
        </Box>
    );
};

export default ResultsViewer;
