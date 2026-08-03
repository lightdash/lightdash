import {
    assertUnreachable,
    isVizBigNumberConfig,
    isVizCartesianChartConfig,
    isVizPieChartConfig,
    isVizTableConfig,
} from '@lightdash/common';
import { Box } from '@mantine-8/core';
import { memo, useEffect, type FC, type JSX } from 'react';
import { useParams } from 'react-router';
import ScreenshotProgressIndicator from '../components/common/ScreenshotProgressIndicator';
import ScreenshotReadyIndicator from '../components/common/ScreenshotReadyIndicator';
import BigNumberView from '../components/DataViz/visualizations/BigNumberView';
import ChartView from '../components/DataViz/visualizations/ChartView';
import { Table } from '../components/DataViz/visualizations/Table';
import { useSavedSqlChartResults } from '../features/sqlRunner/hooks/useSavedSqlChartResults';

const MinimalSqlChartContent = memo(
    ({
        projectUuid,
        savedSqlUuid,
    }: {
        projectUuid: string;
        savedSqlUuid: string;
    }) => {
        const {
            chartQuery: {
                data: chartData,
                isLoading: isChartLoading,
                error: chartError,
            },
            chartResultsQuery: {
                data: chartResultsData,
                isLoading: isChartResultsLoading,
                isFetching: isChartResultsFetching,
                error: chartResultsError,
            },
        } = useSavedSqlChartResults({
            projectUuid,
            savedSqlUuid,
        });

        const hasError = !!chartError || !!chartResultsError;
        const isReady =
            !isChartLoading &&
            !isChartResultsLoading &&
            !!chartData &&
            !!chartResultsData;
        const hasSignaled = isReady || hasError;

        const progressIndicator = (
            <ScreenshotProgressIndicator
                expectedTileUuids={[savedSqlUuid]}
                readyTileUuids={hasSignaled && !hasError ? [savedSqlUuid] : []}
                erroredTileUuids={hasSignaled && hasError ? [savedSqlUuid] : []}
            />
        );

        if (!chartData || !chartResultsData) {
            if (hasError) {
                const errorMessage =
                    chartError?.error?.message ??
                    chartResultsError?.error?.message ??
                    'Error loading SQL chart';
                return (
                    <>
                        <span>{errorMessage}</span>
                        {progressIndicator}
                        <ScreenshotReadyIndicator
                            tilesTotal={1}
                            tilesReady={0}
                            tilesErrored={1}
                        />
                    </>
                );
            }
            return progressIndicator;
        }

        let visualization: JSX.Element;
        if (isVizTableConfig(chartData.config)) {
            visualization = (
                <Box w="100%" h="100%" style={{ overflow: 'auto' }}>
                    <Table
                        resultsRunner={chartResultsData.resultsRunner}
                        columnsConfig={chartData.config.columns}
                        flexProps={{ mah: '100%' }}
                    />
                </Box>
            );
        } else if (isVizBigNumberConfig(chartData.config)) {
            const { fieldConfig } = chartData.config;
            visualization = (
                <BigNumberView
                    spec={chartResultsData.chartSpec}
                    isLoading={isChartResultsFetching}
                    error={undefined}
                    hasValueField={!!fieldConfig?.y?.length}
                />
            );
        } else if (
            isVizCartesianChartConfig(chartData.config) ||
            isVizPieChartConfig(chartData.config)
        ) {
            visualization = (
                <ChartView
                    config={chartData.config}
                    spec={chartResultsData.chartSpec}
                    isLoading={isChartResultsFetching}
                    error={undefined}
                    style={{
                        minHeight: 'inherit',
                        height: '100%',
                        width: '100%',
                    }}
                />
            );
        } else {
            return assertUnreachable(
                chartData.config,
                `Unsupported SQL chart config: ${
                    (chartData.config as { type: unknown }).type
                }`,
            );
        }

        return (
            <>
                <Box mih="inherit" h="100%" data-testid="visualization">
                    {visualization}
                </Box>

                {progressIndicator}
                {hasSignaled && (
                    <ScreenshotReadyIndicator
                        tilesTotal={1}
                        tilesReady={hasError ? 0 : 1}
                        tilesErrored={hasError ? 1 : 0}
                    />
                )}
            </>
        );
    },
);

const MinimalSqlChart: FC = () => {
    const params = useParams<{
        projectUuid: string;
        savedSqlUuid: string;
    }>();

    // White page background for screenshot/PDF exports, regardless of theme
    useEffect(() => {
        document.documentElement.style.backgroundColor = 'white';
        document.body.style.backgroundColor = 'white';
    }, []);

    if (!params.projectUuid || !params.savedSqlUuid) {
        return null;
    }

    return (
        <MinimalSqlChartContent
            projectUuid={params.projectUuid}
            savedSqlUuid={params.savedSqlUuid}
        />
    );
};

export default MinimalSqlChart;
