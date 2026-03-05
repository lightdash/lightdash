import {
    DashboardSearchResult,
    toolGetDashboardChartsArgsSchema,
    toolGetDashboardChartsOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type { GetDashboardChartsFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    getDashboardCharts: GetDashboardChartsFn;
    siteUrl: string;
    pageSize: number;
};

const renderChart = (chart: DashboardSearchResult['charts'][number]) => (
    <chart
        chartUuid={chart.uuid}
        chartType={chart.chartType}
        viewsCount={chart.viewsCount}
    >
        <name>{chart.name}</name>
        {chart.description && <description>{chart.description}</description>}
    </chart>
);

export const getGetDashboardCharts = ({
    getDashboardCharts,
    siteUrl,
    pageSize,
}: Dependencies) =>
    tool({
        description: toolGetDashboardChartsArgsSchema.description,
        inputSchema: toolGetDashboardChartsArgsSchema,
        outputSchema: toolGetDashboardChartsOutputSchema,
        execute: async (args) => {
            try {
                const page = args.page ?? 1;
                const { dashboardName, charts, pagination } =
                    await getDashboardCharts({
                        dashboardUuid: args.dashboardUuid,
                        page,
                        pageSize,
                    });

                return {
                    result: (
                        <dashboardCharts
                            dashboardUuid={args.dashboardUuid}
                            dashboardName={dashboardName}
                            page={pagination.page}
                            pageSize={pagination.pageSize}
                            totalPageCount={pagination.totalPageCount}
                            totalResults={pagination.totalResults}
                        >
                            {charts.map((chart) => renderChart(chart))}
                        </dashboardCharts>
                    ).toString(),
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        `Error getting charts for dashboard: ${args.dashboardUuid}`,
                    ),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
