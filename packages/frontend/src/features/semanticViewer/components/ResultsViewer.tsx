import { ChartKind, isVizTableConfig } from '@lightdash/common';
import { Paper, useMantineTheme } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import { selectChartConfigByKind } from '../../../components/DataViz/store/selectors';
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

    const barChartConfig = useAppSelector((state) =>
        selectChartConfigByKind(state, ChartKind.VERTICAL_BAR),
    );
    const lineChartConfig = useAppSelector((state) =>
        selectChartConfigByKind(state, ChartKind.LINE),
    );
    const pieChartConfig = useAppSelector((state) =>
        selectChartConfigByKind(state, ChartKind.PIE),
    );
    const tableConfig = useAppSelector((state) =>
        selectChartConfigByKind(state, ChartKind.TABLE),
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
                                        minHeight: 500,
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
