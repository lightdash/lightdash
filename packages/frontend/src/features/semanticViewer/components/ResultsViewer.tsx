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
import { selectAllSelectedFieldsByKind } from '../store/selectors';
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
    const { projectUuid, sortBy, results } = useAppSelector(
        (state) => state.semanticViewer,
    );

    const allSelectedFieldsByKind = useAppSelector(
        selectAllSelectedFieldsByKind,
    );
    const dispatch = useAppDispatch();

    const { showToastError } = useToaster();

    const [lastQuery, setLastQuery] = useState<
        typeof allSelectedFieldsByKind | null
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
        return !isEqual(lastQuery, allSelectedFieldsByKind);
    }, [lastQuery, allSelectedFieldsByKind]);

    const handleRunQuery = useCallback(async () => {
        if (!shouldRunNewQuery) return;

        await runSemanticViewerQuery({
            projectUuid,
            query: { ...allSelectedFieldsByKind, sortBy },
        });

        setLastQuery(allSelectedFieldsByKind);
    }, [
        projectUuid,
        sortBy,
        allSelectedFieldsByKind,
        shouldRunNewQuery,
        runSemanticViewerQuery,
    ]);

    const config: SqlTableConfig = useMemo(() => {
        const firstRow = results?.[0];
        const columns = Object.keys(firstRow || {}).reduce((acc, key) => {
            return {
                ...acc,
                [sanitizeFieldId(key)]: {
                    visible: true,
                    reference: sanitizeFieldId(key),
                    label: key,
                    frozen: false,
                    order: undefined,
                },
            };
        }, {});

        return { columns };
    }, [results]);

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
