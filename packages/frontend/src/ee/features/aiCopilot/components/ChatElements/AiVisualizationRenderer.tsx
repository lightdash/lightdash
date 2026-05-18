import {
    AiResultType,
    getGroupByDimensions,
    getWebAiChartConfig,
    type AiAgentChartTypeOption,
    type ApiAiAgentThreadMessageVizQuery,
    type ToolRunQueryArgs,
    type ToolTableVizArgs,
    type ToolTimeSeriesArgs,
    type ToolVerticalBarArgs,
} from '@lightdash/common';
import { Box, Center, Group, Stack, Text } from '@mantine-8/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { useMemo, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import LightdashVisualization from '../../../../../components/LightdashVisualization';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import useHealth from '../../../../../hooks/health/useHealth';
import { AgentVisualizationChartTypeSwitcher } from './AgentVisualizationChartTypeSwitcher';
import AgentVisualizationFilters from './AgentVisualizationFilters';
import AgentVisualizationMetricsAndDimensions from './AgentVisualizationMetricsAndDimensions';

type Props = {
    vizQueryData: ApiAiAgentThreadMessageVizQuery;
    chartConfig:
        | ToolTableVizArgs
        | ToolTimeSeriesArgs
        | ToolVerticalBarArgs
        | ToolRunQueryArgs;
    selectedChartType: AiAgentChartTypeOption | null;
    // When provided, an inline switcher is shown above the chart. Omit it
    // (e.g. on the floating panel) when a parent renders its own switcher.
    onChartTypeChange?: (type: AiAgentChartTypeOption) => void;
    headerContent?: ReactNode;
};

export const AiVisualizationRenderer: FC<Props> = ({
    vizQueryData,
    chartConfig,
    selectedChartType,
    onChartTypeChange,
    headerContent,
}) => {
    const { data: health } = useHealth();

    const { metricQuery, fields } = vizQueryData.query;

    const webAiChartConfig = useMemo(
        () =>
            getWebAiChartConfig({
                vizConfig: chartConfig,
                metricQuery,
                maxQueryLimit: health?.query.maxLimit,
                fieldsMap: fields,
                overrideChartType: selectedChartType ?? undefined,
            }),
        [
            chartConfig,
            metricQuery,
            health?.query.maxLimit,
            fields,
            selectedChartType,
        ],
    );

    const groupByDimensions: string[] | undefined = useMemo(
        () => getGroupByDimensions(webAiChartConfig),
        [webAiChartConfig],
    );

    const displayMetricsAndDimensions =
        vizQueryData.type !== AiResultType.TABLE_RESULT &&
        vizQueryData.type !== AiResultType.QUERY_RESULT;

    const defaultChartType: AiAgentChartTypeOption =
        webAiChartConfig.type === AiResultType.QUERY_RESULT
            ? (webAiChartConfig.vizTool.chartConfig?.defaultVizType ?? 'table')
            : 'table';

    if (!webAiChartConfig.echartsConfig) {
        return (
            <Center h={300}>
                <Stack gap="xs" align="center">
                    <MantineIcon icon={IconExclamationCircle} color="gray" />
                    <Text size="sm" c="dimmed" ta="center">
                        Unable to render visualization - no chart config
                    </Text>
                </Stack>
            </Center>
        );
    }

    return (
        <Stack gap="md" h="100%">
            {headerContent}
            {webAiChartConfig.type === AiResultType.QUERY_RESULT &&
                onChartTypeChange && (
                    <Group justify="flex-end">
                        <AgentVisualizationChartTypeSwitcher
                            metricQuery={metricQuery}
                            selectedChartType={
                                selectedChartType ?? defaultChartType
                            }
                            hasGroupByDimensions={
                                (groupByDimensions?.length ?? 0) > 0
                            }
                            onChartTypeChange={onChartTypeChange}
                        />
                    </Group>
                )}
            <Box
                flex="1"
                style={{
                    // Scrolling for tables
                    overflow: 'auto',
                }}
            >
                <LightdashVisualization
                    className="sentry-block ph-no-capture"
                    data-testid="ai-visualization"
                />
            </Box>

            <Stack gap="xs">
                <ErrorBoundary>
                    {displayMetricsAndDimensions && (
                        <AgentVisualizationMetricsAndDimensions
                            metricQuery={metricQuery}
                            fieldsMap={fields}
                        />
                    )}

                    {chartConfig.filters ? (
                        <AgentVisualizationFilters
                            filters={metricQuery.filters}
                            fieldsMap={fields}
                        />
                    ) : null}
                </ErrorBoundary>
            </Stack>
        </Stack>
    );
};
