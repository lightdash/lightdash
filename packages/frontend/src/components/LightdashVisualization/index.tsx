import { assertUnreachable, ChartType } from '@lightdash/common';
import { Anchor, Text } from '@mantine-8/core';
import { IconChartBarOff } from '@tabler/icons-react';
import { forwardRef, Fragment, lazy, memo, Suspense } from 'react';
import { EmptyState } from '../common/EmptyState';
import MantineIcon from '../common/MantineIcon';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import CustomVisualization from '../CustomVisualization';
import FunnelChart from '../FunnelChart';
import SimpleChart from '../SimpleChart';
import SimpleGauge from '../SimpleGauge';
import SimplePieChart from '../SimplePieChart';
import SimpleStatistic from '../SimpleStatistic';
import SimpleTable from '../SimpleTable';
import SimpleTreemap from '../SimpleTreemap';
import { useVisualizationContext } from './useVisualizationContext';

// Lazy load SimpleMap to avoid bundling Leaflet in the main chunk
const LazySimpleMap = lazy(() => import('../SimpleMap'));

interface LightdashVisualizationProps {
    isDashboard?: boolean;
    tileUuid?: string;
    isTitleHidden?: boolean;
    className?: string;
    'data-testid'?: string;
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
}

const LightdashVisualization = memo(
    forwardRef<HTMLDivElement, LightdashVisualizationProps>(
        (
            {
                isDashboard = false,
                tileUuid,
                isTitleHidden: _isTitleHidden = false,
                className,
                onScreenshotReady,
                onScreenshotError,
                ...props
            },
            ref,
        ) => {
            const { visualizationConfig, minimal, apiErrorDetail } =
                useVisualizationContext();

            if (!visualizationConfig) {
                return null;
            }

            if (apiErrorDetail) {
                return (
                    <div
                        ref={ref}
                        className={className}
                        data-testid={props['data-testid']}
                    >
                        <EmptyState
                            icon={
                                // Icon consistent with SuboptimalState in charts
                                <MantineIcon
                                    color="ldGray.5"
                                    size="xxl"
                                    icon={IconChartBarOff}
                                />
                            }
                            h="100%"
                            w="100%"
                            justify="center"
                            title="Unable to load visualization"
                            description={
                                <Fragment>
                                    <Text style={{ whiteSpace: 'pre-wrap' }}>
                                        {apiErrorDetail.message || ''}
                                    </Text>
                                    {apiErrorDetail.data.documentationUrl && (
                                        <Fragment>
                                            <br />
                                            <Anchor
                                                href={
                                                    apiErrorDetail.data
                                                        .documentationUrl
                                                }
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Learn how to resolve this in our
                                                documentation →
                                            </Anchor>
                                        </Fragment>
                                    )}
                                </Fragment>
                            }
                        ></EmptyState>
                    </div>
                );
            }

            // Render chart content based on type
            let chartContent: React.ReactNode;

            switch (visualizationConfig.chartType) {
                case ChartType.BIG_NUMBER:
                    chartContent = (
                        <SimpleStatistic
                            minimal={minimal}
                            onScreenshotReady={onScreenshotReady}
                            onScreenshotError={onScreenshotError}
                        />
                    );
                    break;
                case ChartType.TABLE:
                    chartContent = (
                        <SimpleTable
                            tileUuid={tileUuid}
                            minimal={minimal}
                            isDashboard={!!isDashboard}
                            $shouldExpand
                            onScreenshotReady={onScreenshotReady}
                            onScreenshotError={onScreenshotError}
                        />
                    );
                    break;
                case ChartType.CARTESIAN:
                    chartContent = (
                        <SimpleChart
                            isInDashboard={!!isDashboard}
                            $shouldExpand
                            onScreenshotReady={onScreenshotReady}
                            onScreenshotError={onScreenshotError}
                        />
                    );
                    break;
                case ChartType.PIE:
                    chartContent = (
                        <SimplePieChart
                            isInDashboard={!!isDashboard}
                            $shouldExpand
                            onScreenshotReady={onScreenshotReady}
                            onScreenshotError={onScreenshotError}
                        />
                    );
                    break;
                case ChartType.FUNNEL:
                    chartContent = (
                        <FunnelChart
                            isInDashboard={!!isDashboard}
                            $shouldExpand
                            onScreenshotReady={onScreenshotReady}
                            onScreenshotError={onScreenshotError}
                        />
                    );
                    break;
                case ChartType.TREEMAP:
                    chartContent = (
                        <SimpleTreemap
                            isInDashboard={!!isDashboard}
                            $shouldExpand
                            onScreenshotReady={onScreenshotReady}
                            onScreenshotError={onScreenshotError}
                        />
                    );
                    break;
                case ChartType.GAUGE:
                    chartContent = (
                        <SimpleGauge
                            isInDashboard={isDashboard}
                            $shouldExpand
                            onScreenshotReady={onScreenshotReady}
                            onScreenshotError={onScreenshotError}
                        />
                    );
                    break;
                case ChartType.MAP:
                    chartContent = (
                        <Suspense
                            fallback={
                                <SuboptimalState
                                    title="Loading map..."
                                    loading
                                />
                            }
                        >
                            <LazySimpleMap
                                isInDashboard={isDashboard}
                                $shouldExpand
                                onScreenshotReady={onScreenshotReady}
                                onScreenshotError={onScreenshotError}
                            />
                        </Suspense>
                    );
                    break;
                case ChartType.CUSTOM:
                    chartContent = (
                        <CustomVisualization
                            onScreenshotReady={onScreenshotReady}
                            onScreenshotError={onScreenshotError}
                        />
                    );
                    break;
                default:
                    return assertUnreachable(
                        visualizationConfig,
                        `Chart type is not implemented`,
                    );
            }

            // Wrap in a div to ensure data-testid and ref are on a DOM element
            // (some chart components like echarts-for-react don't forward these props)
            return (
                <div
                    ref={ref}
                    className={className}
                    data-testid={props['data-testid']}
                    style={{
                        width: '100%',
                        height: '100%',
                        minHeight: 'inherit',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    {chartContent}
                </div>
            );
        },
    ),
);

export default LightdashVisualization;
