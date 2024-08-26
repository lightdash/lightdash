import { type ResultRow, type SemanticLayerResultRow } from '@lightdash/common';
import {
    Button,
    Group,
    Kbd,
    MantineProvider,
    Text,
    Tooltip,
} from '@mantine/core';
import { useOs } from '@mantine/hooks';
import { IconPlayerPlay } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { onResults } from '../../../components/DataViz/store/cartesianChartBaseSlice';
import LimitButton from '../../../components/LimitButton';
import useToaster from '../../../hooks/toaster/useToaster';
import { useSemanticLayerQueryResults } from '../api/hooks';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    selectAllSelectedFieldNames,
    selectAllSelectedFieldsByKind,
    selectSemanticLayerInfo,
} from '../store/selectors';
import { setLimit, setResults } from '../store/semanticViewerSlice';
import { SemanticViewerResultsTransformer } from '../transformers/SemanticViewerResultsTransformer';

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
    const os = useOs();
    const { showToastError } = useToaster();

    const { projectUuid, config } = useAppSelector(selectSemanticLayerInfo);

    const allSelectedFields = useAppSelector(selectAllSelectedFieldNames);
    const { columns, limit, sortBy } = useAppSelector(
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
                            limit,
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
        limit,
    ]);

    const handleSubmit = useCallback(
        () =>
            runSemanticViewerQuery({
                ...allSelectedFieldsByKind,
                sortBy,
                limit,
            }),
        [allSelectedFieldsByKind, runSemanticViewerQuery, sortBy, limit],
    );

    const handleLimitChange = useCallback(
        (newLimit: number) => dispatch(setLimit(newLimit)),
        [dispatch],
    );

    return (
        <Button.Group>
            <Tooltip
                label={
                    <MantineProvider inherit theme={{ colorScheme: 'dark' }}>
                        <Group spacing="xxs">
                            <Kbd fw={600}>
                                {os === 'macos' || os === 'ios' ? '⌘' : 'ctrl'}
                            </Kbd>

                            <Text fw={600}>+</Text>

                            <Kbd fw={600}>Enter</Kbd>
                        </Group>
                    </MantineProvider>
                }
                position="bottom"
                withArrow
                withinPortal
                disabled={isLoading}
            >
                <Button
                    size="xs"
                    pr={limit ? 'xs' : undefined}
                    leftIcon={<MantineIcon icon={IconPlayerPlay} />}
                    onClick={handleSubmit}
                    loading={isLoading}
                    disabled={allSelectedFields.length === 0}
                    sx={(theme) => ({
                        flex: 1,
                        borderRight: `1px solid ${theme.fn.rgba(
                            theme.colors.gray[5],
                            0.6,
                        )}`,
                    })}
                >
                    {`Run query ${limit ? `(${limit})` : ''}`}
                </Button>
            </Tooltip>

            {handleLimitChange !== undefined && (
                <LimitButton
                    disabled={allSelectedFields.length === 0}
                    size="xs"
                    maxLimit={config.maxQueryLimit}
                    limit={limit ?? config.maxQueryLimit}
                    onLimitChange={handleLimitChange}
                />
            )}
        </Button.Group>
    );
};
