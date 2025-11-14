import { assertUnreachable, ChartType } from '@lightdash/common';
import { Anchor, Text } from '@mantine/core';
import { IconChartBarOff } from '@tabler/icons-react';
import { forwardRef, Fragment, memo } from 'react';
import { EmptyState } from '../common/EmptyState';
import MantineIcon from '../common/MantineIcon';
import CustomVisualization from '../CustomVisualization';
import FunnelChart from '../FunnelChart';
import SimpleChart from '../SimpleChart';
import SimpleGauge from '../SimpleGauge';
import SimplePieChart from '../SimplePieChart';
import SimpleStatistic from '../SimpleStatistic';
import SimpleTable from '../SimpleTable';
import SimpleTreemap from '../SimpleTreemap';
import { useVisualizationContext } from './useVisualizationContext';

interface LightdashVisualizationProps {
    isDashboard?: boolean;
    tileUuid?: string;
    isTitleHidden?: boolean;
    className?: string;
    'data-testid'?: string;
}

const LightdashVisualization = memo(
    forwardRef<HTMLDivElement, LightdashVisualizationProps>(
        (
            {
                isDashboard = false,
                tileUuid,
                isTitleHidden = false,
                className,
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
                    <EmptyState
                        icon={
                            // Icon consistent with SuboptimalState in charts
                            <MantineIcon
                                color="gray.5"
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
                );
            }

            switch (visualizationConfig.chartType) {
                case ChartType.BIG_NUMBER:
                    return (
                        <SimpleStatistic
                            minimal={minimal}
                            isTitleHidden={isTitleHidden}
                            isDashboard={isDashboard}
                            className={className}
                            data-testid={props['data-testid']}
                            {...props}
                        />
                    );
                case ChartType.TABLE:
                    return (
                        <SimpleTable
                            tileUuid={tileUuid}
                            minimal={minimal}
                            isDashboard={!!isDashboard}
                            className={className}
                            $shouldExpand
                            data-testid={props['data-testid']}
                            {...props}
                        />
                    );
                case ChartType.CARTESIAN:
                    return (
                        <SimpleChart
                            className={className}
                            isInDashboard={!!isDashboard}
                            $shouldExpand
                            data-testid={props['data-testid']}
                            {...props}
                        />
                    );
                case ChartType.PIE:
                    return (
                        <SimplePieChart
                            className={className}
                            isInDashboard={!!isDashboard}
                            $shouldExpand
                            data-testid={props['data-testid']}
                            {...props}
                        />
                    );
                case ChartType.FUNNEL:
                    return (
                        <FunnelChart
                            className={className}
                            isInDashboard={!!isDashboard}
                            $shouldExpand
                            data-testid={props['data-testid']}
                            {...props}
                        />
                    );
                case ChartType.TREEMAP:
                    return (
                        <SimpleTreemap
                            className={className}
                            isInDashboard={!!isDashboard}
                            $shouldExpand
                            data-testid={props['data-testid']}
                            {...props}
                        />
                    );
                case ChartType.GAUGE:
                    return (
                        <SimpleGauge
                            className={className}
                            isInDashboard={isDashboard}
                            $shouldExpand
                            data-testid={props['data-testid']}
                            {...props}
                        />
                    );
                case ChartType.CUSTOM:
                    return (
                        <div
                            ref={ref}
                            style={{
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                            }}
                        >
                            <CustomVisualization
                                data-testid={props['data-testid']}
                                className={className}
                            />
                        </div>
                    );

                default:
                    return assertUnreachable(
                        visualizationConfig,
                        `Chart type is not implemented`,
                    );
            }
        },
    ),
);

export default LightdashVisualization;
