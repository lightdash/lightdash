import {
    DashboardSearchResult,
    toolGetDashboardChartsArgsSchema,
    toolGetDashboardChartsOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import moment from 'moment';
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
        {chart.verification && (
            <verified
                by={`${chart.verification.verifiedBy.firstName} ${chart.verification.verifiedBy.lastName}`}
                at={moment(chart.verification.verifiedAt).fromNow()}
            />
        )}
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

                const sortedCharts = [...charts].sort(
                    (a, b) =>
                        Number(b.verification !== null) -
                        Number(a.verification !== null),
                );

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
                            {sortedCharts.map((chart) => renderChart(chart))}
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
