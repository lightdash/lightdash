import {
    ChartKind,
    isVizCartesianChartConfig,
    isVizPieChartConfig,
    isVizTableConfig,
} from '@lightdash/common';
import { Box, MantineProvider, type MantineThemeOverride } from '@mantine/core';
import { memo, useEffect, useRef, useState, type FC } from 'react';
import { useParams } from 'react-router';
import ScreenshotProgressIndicator from '../components/common/ScreenshotProgressIndicator';
import ScreenshotReadyIndicator from '../components/common/ScreenshotReadyIndicator';
import ChartView from '../components/DataViz/visualizations/ChartView';
import { Table } from '../components/DataViz/visualizations/Table';
import { useSavedSqlChartResults } from '../features/sqlRunner/hooks/useSavedSqlChartResults';

const themeOverride: MantineThemeOverride = {
    globalStyles: () => ({
        'html, body': {
            backgroundColor: 'white',
        },
    }),
};

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
        const [hasSignaled, setHasSignaled] = useState(false);
        const hasSignaledRef = useRef(false);

        useEffect(() => {
            if (hasSignaledRef.current) return;
            if (!isReady && !hasError) return;
            hasSignaledRef.current = true;
            setHasSignaled(true);
        }, [isReady, hasError]);

        if (!chartData || !chartResultsData) {
            if (hasError) {
                const errorMessage =
                    chartError?.error?.message ??
                    chartResultsError?.error?.message ??
                    'Error loading SQL chart';
                return (
                    <>
                        <span>{errorMessage}</span>
                        <ScreenshotReadyIndicator
                            tilesTotal={1}
                            tilesReady={0}
                            tilesErrored={1}
                        />
                    </>
                );
            }
            return null;
        }

        return (
            <MantineProvider inherit theme={themeOverride}>
                <Box mih="inherit" h="100%" data-testid="visualization">
                    {chartData.config.type === ChartKind.TABLE &&
                        isVizTableConfig(chartData.config) && (
                            <Box w="100%" h="100%" style={{ overflow: 'auto' }}>
                                <Table
                                    resultsRunner={
                                        chartResultsData.resultsRunner
                                    }
                                    columnsConfig={chartData.config.columns}
                                    flexProps={{ mah: '100%' }}
                                />
                            </Box>
                        )}
                    {(isVizCartesianChartConfig(chartData.config) ||
                        isVizPieChartConfig(chartData.config)) && (
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
                    )}
                </Box>

                <ScreenshotProgressIndicator
                    expectedTileUuids={[savedSqlUuid]}
                    readyTileUuids={
                        hasSignaled && !hasError ? [savedSqlUuid] : []
                    }
                    erroredTileUuids={
                        hasSignaled && hasError ? [savedSqlUuid] : []
                    }
                />
                {hasSignaled && (
                    <ScreenshotReadyIndicator
                        tilesTotal={1}
                        tilesReady={hasError ? 0 : 1}
                        tilesErrored={hasError ? 1 : 0}
                    />
                )}
            </MantineProvider>
        );
    },
);

const MinimalSqlChart: FC = () => {
    const params = useParams<{
        projectUuid: string;
        savedSqlUuid: string;
    }>();

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
