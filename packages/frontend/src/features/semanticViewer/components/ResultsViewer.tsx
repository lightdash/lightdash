import { isTableChartSQLConfig } from '@lightdash/common';
import { Paper, useMantineTheme } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import { selectChartConfigByKind } from '../../../components/DataViz/store/selectors';
import ChartView from '../../../components/DataViz/visualizations/ChartView';
import { SemanticViewerResultsRunner } from '../runners/SemanticViewerResultsRunner';
import { useAppSelector } from '../store/hooks';
import {
    selectAllSelectedFieldsByKind,
    selectSemanticLayerInfo,
} from '../store/selectors';
import { Table } from './visualizations/Table';

const ResultsViewer: FC = () => {
    const mantineTheme = useMantineTheme();

    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);

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

    const allSelectedFieldsByKind = useAppSelector(
        selectAllSelectedFieldsByKind,
    );

    const resultsRunner = useMemo(
        () =>
            new SemanticViewerResultsRunner({
                rows: results ?? [],
                columns: columns ?? [],
                query: {
                    ...allSelectedFieldsByKind,
                    sortBy: [],
                },
                projectUuid,
            }),
        [results, columns, allSelectedFieldsByKind, projectUuid],
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
                                    resultsRunner={resultsRunner}
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
