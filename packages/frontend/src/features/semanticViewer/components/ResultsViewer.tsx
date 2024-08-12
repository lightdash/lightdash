import { type ResultRow, type SqlTableConfig } from '@lightdash/common';
import { Box, Button, Center, LoadingOverlay, Overlay } from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import { isEqual } from 'lodash';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import useToaster from '../../../hooks/toaster/useToaster';
import { Table } from '../../sqlRunner/components/visualizations/Table';
import {
    useSemanticViewerQueryRun,
    type SemanticLayerResults,
} from '../api/streamingResults';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    selectAllSelectedFields,
    selectSelectedFieldsByKind,
} from '../store/selectors';
import { setResults } from '../store/semanticViewerSlice';

const sanitizeFieldId = (fieldId: string) => fieldId.replace('.', '_');

const mapResultsToTableData = (results: SemanticLayerResults): ResultRow[] => {
    return results.results.map((result) => {
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
    const { projectUuid, results } = useAppSelector(
        (state) => state.semanticViewer,
    );
    const selectedFieldsByKind = useAppSelector(selectSelectedFieldsByKind);
    const allSelectedFields = useAppSelector(selectAllSelectedFields);
    const dispatch = useAppDispatch();

    const { showToastError } = useToaster();

    const [lastQuery, setLastQuery] = useState<
        typeof selectedFieldsByKind | null
    >(null);

    const { mutateAsync: runSemanticViewerQuery, isLoading } =
        useSemanticViewerQueryRun({
            onSuccess: (data) => {
                if (!data) return;
                dispatch(setResults(mapResultsToTableData(data)));
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
        return !isEqual(lastQuery, allSelectedFields);
    }, [lastQuery, allSelectedFields]);

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
                <Overlay blur={2} opacity={0}>
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

            {results && (
                <Box h="100%">
                    <Table data={results} config={config} />
                </Box>
            )}
        </Box>
    );
};

export default ResultsViewer;
