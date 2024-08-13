import { isTableChartSQLConfig, type ResultRow, type SqlTableConfig } from '@lightdash/common';
import { Box,     
    Group,
    Paper,
    SegmentedControl,
    Text,
    useMantineTheme } from '@mantine/core';
import {  useMemo, useState, type FC } from 'react';
import { useSemanticViewerQueryRun } from '../api/streamingResults';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { EditorTabs, setActiveEditorTab, setResults } from '../store/semanticViewerSlice';
import { useElementSize } from '@mantine/hooks';
import MantineIcon from '../../../components/common/MantineIcon';
import { IconChartHistogram,  } from '@tabler/icons-react';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import { selectCurrentChartConfig } from '../store/selectors';
import SqlRunnerChart from './visualizations/SqlRunnerChart';
import { Table } from './visualizations/Table';

const MIN_RESULTS_HEIGHT = 10;

const sanitizeFieldId = (fieldId: string) => fieldId.replace('.', '_');
const ResultsViewer: FC = () => {
    const {
        projectUuid,
        selectedDimensions,
        selectedTimeDimensions,
        selectedMetrics,
        activeEditorTab,
        results,
    } = useAppSelector((state) => state.semanticViewer);
    const dispatch = useAppDispatch();

    const {
        ref: inputSectionRef,
        width: inputSectionWidth,
        height: inputSectionHeight,
    } = useElementSize();
    const { ref: wrapperRef, height: wrapperHeight } = useElementSize();
    const [resultsHeight, setResultsHeight] = useState(MIN_RESULTS_HEIGHT);
    const maxResultsHeight = useMemo(() => wrapperHeight - 56, [wrapperHeight]);
    const mantineTheme = useMantineTheme();
    const isResultsPanelFullHeight = useMemo(
        () => resultsHeight === maxResultsHeight,
        [resultsHeight, maxResultsHeight],
    );

    const selectedChartType = useAppSelector(
        (state) => state.semanticViewer.selectedChartType,
    );
    // Static results table
    const resultsTableConfig = useAppSelector(
        (state) => state.semanticViewer.resultsTableConfig,
    );
    // currently editing chart config
    const currentVisConfig = useAppSelector((state) =>
        selectCurrentChartConfig(state),
    );
        // Select these configs so we can keep the charts mounted
        const barChartConfig = useAppSelector(
            (state) => state.barChartConfig.config,
        );
        const lineChartConfig = useAppSelector(
            (state) => state.lineChartConfig.config,
        );
        const pieChartConfig = useAppSelector(
            (state) => state.pieChartConfig.config,
        );

    const { mutate: runSemanticViewerQuery,data: queryResults,  isLoading } =
        useSemanticViewerQueryRun({
            onSuccess: (data) => {
                if (data) {
                    const resultRows: ResultRow[] = data.results.map(
                        (result) => {
                            return Object.entries(result).reduce(
                                (acc, entry) => {
                                    const [key, resultValue] = entry;
                                    return {
                                        ...acc,
                                        [sanitizeFieldId(key)]: {
                                            value: {
                                                raw: resultValue,
                                                formatted:
                                                    resultValue?.toString(),
                                            },
                                        },
                                    };
                                },
                                {},
                            );
                        },
                    );
                    dispatch(setResults(resultRows));
                }
            },
        });

    const config: SqlTableConfig = useMemo(() => {
        const columns = [
            ...selectedTimeDimensions,
            ...selectedDimensions,
            ...selectedMetrics,
        ].reduce((acc, dimension) => {
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
        }, {});
        return { columns };
    }, [selectedDimensions, selectedTimeDimensions, selectedMetrics]);
   /* return (
        <Box pos="relative">
            <LoadingOverlay
                visible={isLoading}
                overlayBlur={2}
                loaderProps={{ color: 'gray', size: 'sm' }}
            />
            <button
                onClick={() =>
                    runSemanticViewerQuery({
                        projectUuid,
                        query: {
                            dimensions: selectedDimensions,
                            metrics: selectedMetrics,
                            timeDimensions: selectedTimeDimensions,
                        },
                    })
                }
            >
                Run Query{' '}
            </button>
            {results && <Table data={results} config={config} />}
        </Box>
    );*/


return (<><Paper
    shadow="none"
    radius={0}
    px="md"
    py={6}
    bg="gray.1"
    sx={(theme) => ({
        borderWidth: isResultsPanelFullHeight
            ? '0 0 0 1px'
            : '0 0 1px 1px',
        borderStyle: 'solid',
        borderColor: theme.colors.gray[3],
    })}
>
    <Group position="apart">
        <Group position="apart">
            <SegmentedControl
                color="dark"
                size="sm"
                radius="sm"
                data={[
                   /* {
                        value: 'sql',
                        label: (
                            <Group spacing="xs" noWrap>
                                <MantineIcon
                                    icon={IconCodeCircle}
                                />
                                <Text>Query</Text>
                            </Group>
                        ),
                    },*/
                    {
                        value: 'chart',
                        label: (
                            <Group spacing="xs" noWrap>
                                <MantineIcon
                                    icon={IconChartHistogram}
                                />
                                <Text>Chart</Text>
                            </Group>
                        ),
                        disabled: !queryResults?.results,
                    },
                ]}
                defaultValue={'sql'}
                onChange={(value) => {
                    if (isLoading) {
                        return;
                    }
                    if (value === 'sql') {
                        dispatch(
                            setActiveEditorTab(EditorTabs.SQL),
                        );
                    } else {
                        dispatch(
                            setActiveEditorTab(
                                EditorTabs.VISUALIZATION,
                            ),
                        );
                    }
                }}
            />
        </Group>

        <Group spacing="md">
            {/*
            <RunSqlQueryButton
                isLoading={isLoading}
                disabled={!sql}
                limit={limit}
                onSubmit={() => handleRunQuery()}
                onLimitChange={(newLimit) => {
                    dispatch(setSqlLimit(newLimit));
                    handleRunQuery(newLimit);
                }}
            />*/}
             <button
                onClick={() =>
                    runSemanticViewerQuery({
                        projectUuid,
                        query: {
                            dimensions: selectedDimensions,
                            metrics: selectedMetrics,
                            timeDimensions: selectedTimeDimensions,
                        },
                    })
                }
            >
                Run Query{' '}
            </button>
        </Group>
    </Group>
</Paper>

<Paper
    ref={inputSectionRef}
    shadow="none"
    radius={0}
    style={{ flex: 1 }}
    sx={(theme) => ({
        borderWidth: '0 0 0 1px',
        borderStyle: 'solid',
        borderColor: theme.colors.gray[3],
        overflow: 'auto',
    })}
>
    <Box
        style={{ flex: 1 }}
        sx={{
            height: '500px',
            width: inputSectionWidth,
        }}
    >
        {/* <ConditionalVisibility
            isVisible={activeEditorTab === EditorTabs.SQL}
        >
            <SqlEditor
                sql={sql}
                onSqlChange={(newSql) =>
                    dispatch(setSql(newSql))
                }
                onSubmit={() => handleRunQuery()}
            />
        </ConditionalVisibility>*/}

        <ConditionalVisibility
            isVisible={
                true
               // activeEditorTab === EditorTabs.VISUALIZATION
            }
        >
            {queryResults?.results &&
                currentVisConfig &&
                [
                    barChartConfig,
                    lineChartConfig,
                    pieChartConfig,
                ].map(
                    (config, idx) =>
                        config && (
                            <ConditionalVisibility
                                key={idx}
                                isVisible={
                                    selectedChartType ===
                                    config?.type
                                }
                            >
                                <SqlRunnerChart
                                    data={queryResults}
                                    config={config}
                                    isLoading={isLoading}
                                    style={{
                                        // NOTE: Ensures the chart is always full height
                                        height: 500,
                                        width: '100%',
                                        flex: 1,
                                        marginTop:
                                            mantineTheme.spacing
                                                .sm,
                                    }}
                                />
                            </ConditionalVisibility>
                        ),
                )}

            {results &&
                isTableChartSQLConfig(currentVisConfig) && (
                    <Paper
                        shadow="none"
                        radius={0}
                        p="sm"
                        sx={() => ({
                            flex: 1,
                            overflow: 'auto',
                        })}
                    >
                        <Table
                            data={results || []}
                            config={currentVisConfig}
                        />
                    </Paper>
                )}
        </ConditionalVisibility>
    </Box>
</Paper></>)

};

export default ResultsViewer;
