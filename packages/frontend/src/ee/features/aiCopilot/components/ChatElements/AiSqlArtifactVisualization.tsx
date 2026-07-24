import {
    ChartKind,
    isVizTableConfig,
    type ApiAiAgentSqlArtifactVizQuery,
    type RawResultRow,
    type ResultRow,
} from '@lightdash/common';
import { Box, Center, Loader, Stack } from '@mantine-8/core';
import { useEffect, useMemo, type FC, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { resetChartState } from '../../../../../components/DataViz/store/actions/commonChartActions';
import {
    selectCompleteConfigByKind,
    selectPivotChartDataByKind,
} from '../../../../../components/DataViz/store/selectors';
import ChartView from '../../../../../components/DataViz/visualizations/ChartView';
import { Table } from '../../../../../components/DataViz/visualizations/Table';
import { VisualizationSwitcher } from '../../../../../components/DataViz/VisualizationSwitcher';
import { store, type RootState } from '../../../../../features/sqlRunner/store';
import {
    useAppDispatch,
    useAppSelector,
} from '../../../../../features/sqlRunner/store/hooks';
import {
    EditorTabs,
    hydrateSqlQueryResults,
    resetState,
    selectActiveChartType,
    selectSqlRunnerResultsRunner,
    setActiveEditorTab,
    setSelectedChartType,
} from '../../../../../features/sqlRunner/store/sqlRunnerSlice';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';

const unwrapRows = (rows: ResultRow[]): RawResultRow[] =>
    rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([key, value]) => [key, value.value.raw]),
        ),
    );

type ContentProps = {
    projectUuid: string;
    vizQueryData: ApiAiAgentSqlArtifactVizQuery;
    results: InfiniteQueryResults;
    headerContent: ReactNode;
};

const AiSqlArtifactVisualizationContent: FC<ContentProps> = ({
    projectUuid,
    vizQueryData,
    results,
    headerContent,
}) => {
    const dispatch = useAppDispatch();
    const columns = useMemo(
        () => Object.values(results.columns ?? {}),
        [results.columns],
    );
    const rows = useMemo(() => unwrapRows(results.rows), [results.rows]);

    useEffect(() => {
        dispatch(resetState());
        dispatch(resetChartState());
        dispatch(setSelectedChartType(ChartKind.TABLE));

        return () => {
            dispatch(resetState());
            dispatch(resetChartState());
        };
    }, [dispatch]);

    useEffect(() => {
        if (columns.length === 0) return;

        dispatch(
            hydrateSqlQueryResults({
                projectUuid,
                sql: vizQueryData.sql,
                limit: vizQueryData.limit,
                queryUuid: vizQueryData.queryUuid,
                fileUrl: undefined,
                columns,
                results: rows,
            }),
        );
    }, [columns, dispatch, projectUuid, rows, vizQueryData]);

    useEffect(() => {
        if (!results.hasFetchedAllRows && !results.fetchAll) {
            results.setFetchAll(true);
        }
    }, [results]);

    const selectedChartType =
        useAppSelector(selectActiveChartType) ?? ChartKind.TABLE;
    const resultsRunner = useAppSelector((state) =>
        selectSqlRunnerResultsRunner(state),
    );
    const currentVizConfig = useAppSelector((state) =>
        selectCompleteConfigByKind(state as RootState, selectedChartType),
    );
    const pivotedChartInfo = useAppSelector((state) =>
        selectPivotChartDataByKind(state as RootState, selectedChartType),
    );

    const handleChartTypeChange = (chartKind: ChartKind) => {
        dispatch(setSelectedChartType(chartKind));
        if (chartKind !== ChartKind.TABLE) {
            dispatch(setActiveEditorTab(EditorTabs.VISUALIZATION));
        }
    };

    if (
        results.isInitialLoading ||
        results.isFetchingFirstPage ||
        columns.length === 0 ||
        !currentVizConfig
    ) {
        return (
            <Center h={300}>
                <Loader
                    type="dots"
                    color="gray"
                    delayedMessage="Loading SQL results..."
                />
            </Center>
        );
    }

    return (
        <Stack gap="md" h="100%" mih={300}>
            {headerContent}
            <Box ml="auto">
                <VisualizationSwitcher
                    selectedChartType={selectedChartType}
                    setSelectedChartType={handleChartTypeChange}
                />
            </Box>
            <Box flex={1} mih={0} pos="relative">
                {isVizTableConfig(currentVizConfig) ? (
                    <Table
                        resultsRunner={resultsRunner}
                        columnsConfig={currentVizConfig.columns}
                        flexProps={{ mah: '100%', h: '100%' }}
                    />
                ) : (
                    <ChartView
                        config={currentVizConfig}
                        spec={pivotedChartInfo?.data?.getChartSpec()}
                        isLoading={pivotedChartInfo?.loading ?? false}
                        error={pivotedChartInfo?.error}
                        style={{ height: '100%', minHeight: 300 }}
                    />
                )}
            </Box>
        </Stack>
    );
};

export const AiSqlArtifactVisualization: FC<ContentProps> = (props) => (
    <Provider store={store}>
        <AiSqlArtifactVisualizationContent {...props} />
    </Provider>
);
