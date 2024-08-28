import { isVizTableConfig } from '@lightdash/common';
import { Paper, useMantineTheme } from '@mantine/core';
import { useEffect, useMemo, type FC } from 'react';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import ChartView from '../../../components/DataViz/visualizations/ChartView';
import { Table } from '../../../components/DataViz/visualizations/Table';
import { SemanticViewerResultsRunner } from '../runners/SemanticViewerResultsRunner';
import { useAppSelector } from '../store/hooks';
import {
    selectAllSelectedFieldsByKind,
    selectSemanticLayerInfo,
} from '../store/selectors';

const ResultsViewer: FC = () => {
    const mantineTheme = useMantineTheme();

    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);

    const { results, columns, selectedChartType } = useAppSelector(
        (state) => state.semanticViewer,
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
    const tableConfig = useAppSelector((state) => state.tableVisConfig.config);

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

    useEffect(() => {
        console.log(selectedChartType);
    }, [selectedChartType]);

    return (
        <>
            {[tableConfig, barChartConfig, lineChartConfig, pieChartConfig].map(
                (config, idx) => {
                    return (
                        <ConditionalVisibility
                            key={idx}
                            isVisible={
                                Boolean(config) &&
                                selectedChartType === config?.type
                            }
                        >
                            {isVizTableConfig(config) ? (
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
                                        resultsRunner={resultsRunner}
                                        config={config}
                                    />
                                </Paper>
                            ) : (
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
                            )}
                        </ConditionalVisibility>
                    );
                },
            )}
        </>
    );
};

export default ResultsViewer;
