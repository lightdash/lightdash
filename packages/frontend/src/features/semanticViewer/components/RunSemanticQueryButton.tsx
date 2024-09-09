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
import { setChartOptionsAndConfig } from '../../../components/DataViz/store/actions/commonChartActions';
import { selectChartConfigByKind } from '../../../components/DataViz/store/selectors';
import getChartConfigAndOptions from '../../../components/DataViz/transformers/getChartConfigAndOptions';
import LimitButton from '../../../components/LimitButton';
import useToaster from '../../../hooks/toaster/useToaster';
import { useSemanticLayerQueryResults } from '../api/hooks';
import { SemanticViewerResultsRunner } from '../runners/SemanticViewerResultsRunner';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    selectAllSelectedFieldNames,
    selectSemanticLayerInfo,
    selectSemanticLayerQuery,
} from '../store/selectors';
import { setLimit, setResults } from '../store/semanticViewerSlice';

export const RunSemanticQueryButton: FC = () => {
    const os = useOs();
    const { showToastError } = useToaster();

    const { projectUuid, config } = useAppSelector(selectSemanticLayerInfo);
    const semanticQuery = useAppSelector(selectSemanticLayerQuery);

    const allSelectedFields = useAppSelector(selectAllSelectedFieldNames);
    const { limit, activeChartKind, columns, results, fields } = useAppSelector(
        (state) => state.semanticViewer,
    );
    const currentVizConfig = useAppSelector((state) =>
        selectChartConfigByKind(state, activeChartKind),
    );

    const dispatch = useAppDispatch();

    const {
        data: requestData,
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

    const resultsData = useMemo(() => requestData?.results, [requestData]);
    const resultsColumns = useMemo(() => requestData?.columns, [requestData]);

    useEffect(() => {
        if (!resultsColumns || !resultsData) return;

        const vizSqlColumns =
            SemanticViewerResultsRunner.convertColumnsToVizSqlColumns(
                fields,
                resultsColumns,
            );

        dispatch(setResults({ results: resultsData, columns: vizSqlColumns }));
    }, [dispatch, resultsData, resultsColumns, fields]);

    useEffect(() => {
        const resultsRunner = new SemanticViewerResultsRunner({
            query: semanticQuery,
            rows: results,
            columns,
            projectUuid,
            fields,
        });

        const chartResultOptions = getChartConfigAndOptions(
            resultsRunner,
            activeChartKind,
            currentVizConfig,
        );

        dispatch(setChartOptionsAndConfig(chartResultOptions));
    }, [
        activeChartKind,
        columns,
        currentVizConfig,
        dispatch,
        projectUuid,
        results,
        semanticQuery,
        fields,
    ]);

    const handleSubmit = useCallback(
        () => runSemanticViewerQuery(semanticQuery),
        [semanticQuery, runSemanticViewerQuery],
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
