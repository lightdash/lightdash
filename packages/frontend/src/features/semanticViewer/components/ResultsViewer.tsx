import { isTableChartSQLConfig } from '@lightdash/common';
import { Paper, useMantineTheme } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import { selectChartConfigByKind } from '../../../components/DataViz/store/selectors';
import ChartView from '../../../components/DataViz/visualizations/ChartView';
import { useAppSelector } from '../store/hooks';
import { SemanticViewerResultsTransformer } from '../transformers/SemanticViewerResultsTransformer';
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

    const transformer = useMemo(
        () =>
            new SemanticViewerResultsTransformer({
                rows: results ?? [],
                columns: columns ?? [],
            }),
        [results, columns],
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
                                <ChartView
                                    transformer={transformer}
                                    data={{ results, columns }}
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
