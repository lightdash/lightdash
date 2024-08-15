import {
    isTableChartSQLConfig,
    type ResultRow,
    type SemanticLayerResultRow,
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
import { useEffect, type FC } from 'react';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import MantineIcon from '../../../components/common/MantineIcon';
import useToaster from '../../../hooks/toaster/useToaster';
import { useSemanticViewerQueryRun } from '../api/streamingResults';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    selectAllSelectedFieldNames,
    selectAllSelectedFieldsByKind,
    selectCurrentChartConfig,
} from '../store/selectors';
import {
    EditorTabs,
    setActiveEditorTab,
    setResults,
} from '../store/semanticViewerSlice';
import RunQueryButton from './RunSqlQueryButton';
import SqlViewer from './SqlViewer';
import SqlRunnerChart from './visualizations/SqlRunnerChart';
import { Table } from './visualizations/Table';

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
    const { showToastError } = useToaster();

    const { ref: inputSectionRef, width: inputSectionWidth } = useElementSize();
    const mantineTheme = useMantineTheme();

    const dispatch = useAppDispatch();

    const { projectUuid, activeEditorTab, results, columns, sortBy } =
        useAppSelector((state) => state.semanticViewer);

    const allSelectedFields = useAppSelector(selectAllSelectedFieldNames);
    const allSelectedFieldsByKind = useAppSelector(
        selectAllSelectedFieldsByKind,
    );

    const selectedChartType = useAppSelector(
        (state) => state.semanticViewer.selectedChartType,
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

    useEffect(() => {
        if (resultsData) {
            const allReferencedColumns = allSelectedFields.map(sanitizeFieldId);

            const usedColumns = columns.filter((c) =>
                allReferencedColumns.includes(c.reference),
            );
            dispatch(
                setResults({
                    results: resultsData,
                    columns: usedColumns,
                }),
            );
        }
    }, [resultsData, columns, dispatch, allSelectedFields]);

    return (
        <>
            <Paper
                shadow="none"
                radius={0}
                px="md"
                py={6}
                bg="gray.1"
                sx={(theme) => ({
                    borderWidth: '0 0 0 1px',
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
                                    disabled: results.length === 0,
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
                                        ...allSelectedFieldsByKind,
                                        sortBy,
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
                        {results &&
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
                                                data={{
                                                    results,
                                                    columns,
                                                    sortBy: [],
                                                }}
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
