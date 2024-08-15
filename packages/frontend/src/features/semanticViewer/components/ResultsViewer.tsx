import { isTableChartSQLConfig } from '@lightdash/common';
import { Paper, useMantineTheme } from '@mantine/core';
import { type FC } from 'react';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import { useAppSelector } from '../store/hooks';
import { selectCurrentChartConfig } from '../store/selectors';
import SqlRunnerChart from './visualizations/SqlRunnerChart';
import { Table } from './visualizations/Table';

const ResultsViewer: FC = () => {
    const mantineTheme = useMantineTheme();

    const { results, columns } = useAppSelector(
        (state) => state.semanticViewer,
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

    return (
        <>
            {results &&
                currentVisConfig &&
                [barChartConfig, lineChartConfig, pieChartConfig].map(
                    (config, idx) =>
                        config && (
                            <ConditionalVisibility
                                key={idx}
                                isVisible={selectedChartType === config?.type}
                            >
                                <SqlRunnerChart
                                    data={{
                                        results,
                                        columns,
                                        sortBy: [],
                                    }}
                                    config={config}
                                    isLoading={false}
                                    style={{
                                        // NOTE: Ensures the chart is always full height
                                        //height: 500,
                                        width: '100%',
                                        flex: 1,
                                        marginTop: mantineTheme.spacing.sm,
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
                    <Table data={results || []} config={currentVisConfig} />
                </Paper>
            )}
        </>
    );
};

export default ResultsViewer;
