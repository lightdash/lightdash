import { isVizTableConfig } from '@lightdash/common';
import {
    Group,
    Indicator,
    Paper,
    SegmentedControl,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconChartHistogram, IconCodeCircle } from '@tabler/icons-react';
import type { EChartsInstance } from 'echarts-for-react';
import { useCallback, useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    cartesianChartSelectors,
    selectCompleteConfigByKind,
    selectPivotChartDataByKind,
} from '../../../components/DataViz/store/selectors';
import RunSqlQueryButton from '../../../components/SqlRunner/RunSqlQueryButton';
import { DEFAULT_SQL_LIMIT } from '../constants';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    EditorTabs,
    selectActiveChartType,
    selectActiveEditorTab,
    selectLimit,
    selectProjectUuid,
    selectSavedSqlChart,
    selectSql,
    selectSqlQueryResults,
    setActiveEditorTab,
    setSqlLimit,
} from '../store/sqlRunnerSlice';
import { runSqlQuery } from '../store/thunks';
import { ChartDownload } from './Download/ChartDownload';
import { ResultsDownloadFromUrl } from './Download/ResultsDownloadFromUrl';
import { SqlQueryHistory } from './SqlQueryHistory';

export const ContentPanelTabs: FC<{
    activeEchartsInstance: EChartsInstance;
}> = ({ activeEchartsInstance }) => {
    // State we need from redux
    const savedSqlChart = useAppSelector(selectSavedSqlChart);
    const sql = useAppSelector(selectSql);
    const selectedChartType = useAppSelector(selectActiveChartType);
    const limit = useAppSelector(selectLimit);
    const activeEditorTab = useAppSelector(selectActiveEditorTab);
    const isLoadingSqlQuery = useAppSelector(
        (state) => state.sqlRunner.queryIsLoading,
    );
    const projectUuid = useAppSelector(selectProjectUuid);
    const pivotedChartInfo = useAppSelector((state) =>
        selectPivotChartDataByKind(state, selectedChartType),
    );
    // So we can dispatch to redux
    const dispatch = useAppDispatch();

    // state for helping highlight errors in the editor
    const mode = useAppSelector((state) => state.sqlRunner.mode);
    const currentVizConfig = useAppSelector((state) =>
        selectCompleteConfigByKind(state, selectedChartType),
    );

    const handleRunQuery = useCallback(
        async (sqlToUse: string) => {
            if (!sqlToUse) return;

            await dispatch(
                runSqlQuery({
                    sql: sqlToUse,
                    limit: DEFAULT_SQL_LIMIT,
                    projectUuid,
                }),
            );
        },
        [dispatch, projectUuid],
    );

    const hasUnrunChanges = useAppSelector(
        (state) => state.sqlRunner.hasUnrunChanges,
    );
    const hasErrors = useAppSelector(
        (state) =>
            !!cartesianChartSelectors.getErrors(state, selectedChartType),
    );
    const queryResults = useAppSelector(selectSqlQueryResults);

    const canSetSqlLimit = useMemo(
        () => activeEditorTab === EditorTabs.VISUALIZATION,
        [activeEditorTab],
    );

    const resultsFileUrl = useMemo(() => queryResults?.fileUrl, [queryResults]);

    return (
        <Paper
            shadow="none"
            radius={0}
            px="md"
            py={6}
            bg="gray.1"
            sx={(theme) => ({
                borderWidth: '0 0 1px 1px',
                borderStyle: 'solid',
                borderColor: theme.colors.gray[3],
            })}
        >
            <Group position="apart">
                <Group position="apart">
                    <Indicator
                        color="red.6"
                        offset={10}
                        disabled={!hasErrors || mode === 'virtualView'}
                    >
                        <SegmentedControl
                            display={
                                mode === 'virtualView' ? 'none' : undefined
                            }
                            styles={(theme) => ({
                                root: {
                                    backgroundColor: theme.colors.gray[2],
                                },
                            })}
                            size="sm"
                            radius="md"
                            data={[
                                {
                                    value: EditorTabs.SQL,
                                    label: (
                                        <Tooltip
                                            disabled={!hasUnrunChanges}
                                            variant="xs"
                                            withinPortal
                                            label="You haven't run this query yet."
                                        >
                                            <Group spacing={4} noWrap>
                                                <MantineIcon
                                                    color="gray.6"
                                                    icon={IconCodeCircle}
                                                />
                                                <Text>SQL</Text>
                                            </Group>
                                        </Tooltip>
                                    ),
                                },

                                {
                                    value: EditorTabs.VISUALIZATION,
                                    label: (
                                        <Tooltip
                                            disabled={!!queryResults?.results}
                                            variant="xs"
                                            withinPortal
                                            label="Run a query to see the chart"
                                        >
                                            <Group spacing={4} noWrap>
                                                <MantineIcon
                                                    color="gray.6"
                                                    icon={IconChartHistogram}
                                                />
                                                <Text>Chart</Text>
                                            </Group>
                                        </Tooltip>
                                    ),
                                },
                            ]}
                            value={activeEditorTab}
                            onChange={(value: EditorTabs) => {
                                if (isLoadingSqlQuery) {
                                    return;
                                }

                                if (
                                    value === EditorTabs.VISUALIZATION &&
                                    !queryResults?.results
                                ) {
                                    return;
                                }

                                dispatch(setActiveEditorTab(value));
                            }}
                        />
                    </Indicator>
                </Group>
                <Group spacing="xs">
                    {activeEditorTab === EditorTabs.SQL && <SqlQueryHistory />}
                    <RunSqlQueryButton
                        isLoading={isLoadingSqlQuery}
                        disabled={!sql}
                        onSubmit={() => handleRunQuery(sql)}
                        {...(canSetSqlLimit
                            ? {
                                  onLimitChange: (l) =>
                                      dispatch(setSqlLimit(l)),
                                  limit,
                              }
                            : {})}
                    />
                    {activeEditorTab === EditorTabs.VISUALIZATION &&
                    !isVizTableConfig(currentVizConfig) &&
                    selectedChartType ? (
                        <ChartDownload
                            fileUrl={pivotedChartInfo?.data?.chartFileUrl}
                            columnNames={
                                pivotedChartInfo?.data?.columns?.map(
                                    (c) => c.reference,
                                ) ?? []
                            }
                            chartName={savedSqlChart?.name}
                            echartsInstance={activeEchartsInstance}
                        />
                    ) : (
                        mode === 'default' && (
                            <ResultsDownloadFromUrl
                                fileUrl={resultsFileUrl}
                                columnNames={
                                    queryResults?.columns.map(
                                        (c) => c.reference,
                                    ) ?? []
                                }
                                chartName={savedSqlChart?.name}
                            />
                        )
                    )}
                </Group>
            </Group>
        </Paper>
    );
};
