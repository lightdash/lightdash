import { isTableChartSQLConfig } from '@lightdash/common';
import { Paper, useMantineTheme } from '@mantine/core';
import { type FC } from 'react';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import { selectChartConfigByKind } from '../../../components/DataViz/store/selectors';
import { useAppSelector } from '../store/hooks';
import SqlRunnerChart from './visualizations/SqlRunnerChart';
import { Table } from './visualizations/Table';

const ResultsViewer: FC = () => {
    const mantineTheme = useMantineTheme();

    const { results, columns, selectedChartType } = useAppSelector(
        (state) => state.semanticViewer,
    );

    // currently editing chart config

    const currentVisConfig = useAppSelector((state) =>
        selectChartConfigByKind(state, selectedChartType),
    );
    // Select these configs so we can keep the charts mounted
    //TODO - refactor to use selector from dataviz slice
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
