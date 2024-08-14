import {
    DimensionType,
    isTableChartSQLConfig,
    type ResultRow,
    type SqlColumn,
} from '@lightdash/common';
import {
    Box,
    Group,
    Paper,
    SegmentedControl,
    Text,
    useMantineTheme,
} from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { IconChartHistogram, IconCodeCircle } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import MantineIcon from '../../../components/common/MantineIcon';
import { useSemanticViewerQueryRun } from '../api/streamingResults';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectCurrentChartConfig } from '../store/selectors';
import {
    EditorTabs,
    setActiveEditorTab,
    setResults,
} from '../store/semanticViewerSlice';
import RunQueryButton from './RunSqlQueryButton';
import SqlViewer from './SqlViewer';
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
        //  height: inputSectionHeight,
    } = useElementSize();
    const { /*ref: wrapperRef, */ height: wrapperHeight } = useElementSize();
    const [resultsHeight /*, setResultsHeight*/] = useState(MIN_RESULTS_HEIGHT);
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
    /*  const resultsTableConfig = useAppSelector(
        (state) => state.semanticViewer.resultsTableConfig,
    );*/
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

    const {
        mutate: runSemanticViewerQuery,
        data: queryResults,
        isLoading,
    } = useSemanticViewerQueryRun({
        onSuccess: (data) => {
            if (data) {
                const resultRows: ResultRow[] = data.results.map((result) => {
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
                const columns: SqlColumn[] = [
                    ...selectedDimensions,
                    // ...selectedTimeDimensions,
                    ...selectedMetrics,
                ].map((field) => ({
                    reference: sanitizeFieldId(field),
                    type:
                        sanitizeFieldId(field) === 'users_count'
                            ? DimensionType.NUMBER
                            : DimensionType.STRING,
                }));
                dispatch(setResults({ results: resultRows, columns: columns }));
            }
        },
    });
    /*
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

    return (
        <>
            <Paper
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
                                {
                                    value: 'sql',
                                    label: (
                                        <Group spacing="xs" noWrap>
                                            <MantineIcon
                                                icon={IconCodeCircle}
                                            />
                                            <Text>Query</Text>
                                        </Group>
                                    ),
                                },
                            ]}
                            defaultValue={EditorTabs.VISUALIZATION}
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
                        <RunQueryButton
                            isLoading={isLoading}
                            //disabled={selectedTimeDimensions.length === 0}
                            //limit={limit}
                            onSubmit={() =>
                                runSemanticViewerQuery({
                                    projectUuid,
                                    query: {
                                        dimensions: selectedDimensions,
                                        metrics: selectedMetrics,
                                        timeDimensions: selectedTimeDimensions,
                                    },
                                })
                            }
                            /*onLimitChange={(newLimit) => {
                    dispatch(setSqlLimit(newLimit));
                    handleRunQuery(newLimit);
                }}*/
                        />
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
                        //position: 'absolute',
                        //overflowY: 'hidden',
                        //height: inputSectionHeight,

                        width: inputSectionWidth,
                    }}
                >
                    <ConditionalVisibility
                        isVisible={activeEditorTab === EditorTabs.SQL}
                    >
                        <SqlViewer />
                    </ConditionalVisibility>

                    <ConditionalVisibility
                        isVisible={activeEditorTab === EditorTabs.VISUALIZATION}
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
                                                    //height: 500,
                                                    width: '100%',
                                                    flex: 1,
                                                    marginTop:
                                                        mantineTheme.spacing.sm,
                                                }}
                                            />
                                        </ConditionalVisibility>
                                    ),
                            )}

                        {results && isTableChartSQLConfig(currentVisConfig) && (
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
            </Paper>
        </>
    );
};

export default ResultsViewer;
