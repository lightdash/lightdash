import {
    ChartKind,
    FieldType,
    isVizTableConfig,
    SemanticLayerSortByDirection,
} from '@lightdash/common';
import { Button, Group, Paper, Text, useMantineTheme } from '@mantine/core';
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import MantineIcon from '../../../components/common/MantineIcon';
import { selectChartConfigByKind } from '../../../components/DataViz/store/selectors';
import ChartView from '../../../components/DataViz/visualizations/ChartView';
import { Table } from '../../../components/DataViz/visualizations/Table';
import { SemanticViewerResultsRunner } from '../runners/SemanticViewerResultsRunner';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    selectAllSelectedFieldsByKind,
    selectSemanticLayerInfo,
} from '../store/selectors';
import { updateSortBy } from '../store/semanticViewerSlice';

const ResultsViewer: FC = () => {
    const mantineTheme = useMantineTheme();
    const dispatch = useAppDispatch();
    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);

    const { results, columns, selectedChartType, sortBy, limit } =
        useAppSelector((state) => state.semanticViewer);

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
                    sortBy,
                    limit,
                },
                projectUuid,
            }),
        [results, columns, allSelectedFieldsByKind, sortBy, limit, projectUuid],
    );

    const handleAddSortBy = (fieldName: string, kind: FieldType) => {
        dispatch(updateSortBy({ name: fieldName, kind }));
    };

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
                            <Group m="md" spacing="xxs" align="baseline">
                                <Text fw={600} h="100%" mr="xs">
                                    Sort by:
                                </Text>
                                {Object.entries(allSelectedFieldsByKind).map(
                                    ([kind, fields]) =>
                                        fields.map((field) => {
                                            // TODO: this is annoying
                                            const normalKind =
                                                kind === 'metrics'
                                                    ? FieldType.METRIC
                                                    : FieldType.DIMENSION;

                                            const sortDirection = sortBy.find(
                                                (s) =>
                                                    s.name === field.name &&
                                                    s.kind === normalKind,
                                            )?.direction;

                                            return (
                                                <Button
                                                    key={`${kind}-${field.name}`}
                                                    variant={
                                                        sortDirection
                                                            ? 'filled'
                                                            : 'outline'
                                                    }
                                                    size="sm"
                                                    mr="xs"
                                                    mb="xs"
                                                    color={
                                                        kind === 'metrics'
                                                            ? 'orange'
                                                            : 'blue'
                                                    }
                                                    compact
                                                    onClick={() =>
                                                        handleAddSortBy(
                                                            field.name,
                                                            normalKind,
                                                        )
                                                    }
                                                    rightIcon={
                                                        sortDirection && (
                                                            <MantineIcon
                                                                icon={
                                                                    sortDirection ===
                                                                    SemanticLayerSortByDirection.ASC
                                                                        ? IconArrowUp
                                                                        : IconArrowDown
                                                                }
                                                            ></MantineIcon>
                                                        )
                                                    }
                                                >
                                                    {field.name}
                                                </Button>
                                            );
                                        }),
                                )}
                            </Group>
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
