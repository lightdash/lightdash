import {
    DashboardSearchResult,
    getDashboardChartsToolDefinition,
    ToolGetDashboardChartsStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import moment from 'moment';
import type { GetDashboardChartsFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    getDashboardCharts: GetDashboardChartsFn;
    siteUrl: string;
    pageSize: number;
};

const toolDefinition = getDashboardChartsToolDefinition.for('agent');

type DashboardChart = ToolGetDashboardChartsStructuredContent['charts'][number];

const toDashboardChart = (
    chart: DashboardSearchResult['charts'][number],
): DashboardChart => ({
    uuid: chart.uuid,
    name: chart.name,
    description: chart.description ?? null,
    chartType: chart.chartType,
    viewsCount: chart.viewsCount,
    verification: chart.verification
        ? {
              verifiedBy: `${chart.verification.verifiedBy.firstName} ${chart.verification.verifiedBy.lastName}`,
              verifiedAt: moment(chart.verification.verifiedAt).toISOString(),
          }
        : null,
});

const renderChart = (chart: DashboardChart) => (
    <chart
        chartUuid={chart.uuid}
        chartType={chart.chartType}
        viewsCount={chart.viewsCount}
    >
        <name>{chart.name}</name>
        {chart.description && <description>{chart.description}</description>}
        {chart.verification && (
            <verified
                by={chart.verification.verifiedBy}
                at={moment(chart.verification.verifiedAt).fromNow()}
            />
        )}
    </chart>
);

const renderDashboardCharts = (
    content: ToolGetDashboardChartsStructuredContent,
) =>
    (
        <dashboardCharts
            dashboardUuid={content.dashboardUuid}
            dashboardName={content.dashboardName}
            page={content.page}
            pageSize={content.pageSize}
            totalPageCount={content.totalPageCount}
            totalResults={content.totalResults}
        >
            {content.charts.map((chart) => renderChart(chart))}
        </dashboardCharts>
    ).toString();

export const getGetDashboardCharts = ({
    getDashboardCharts,
    siteUrl,
    pageSize,
}: Dependencies) =>
    tool({
        ...toolDefinition,
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

                const structuredContent: ToolGetDashboardChartsStructuredContent =
                    {
                        dashboardUuid: args.dashboardUuid,
                        dashboardName,
                        page: pagination.page,
                        pageSize: pagination.pageSize,
                        totalPageCount: pagination.totalPageCount,
                        totalResults: pagination.totalResults,
                        charts: sortedCharts.map(toDashboardChart),
                    };

                return {
                    result: renderDashboardCharts(structuredContent),
                    metadata: {
                        status: 'success',
                    },
                    structuredContent,
                };
            } catch (error) {
                return toolErrorOutput(
                    error,
                    `Error getting charts for dashboard: ${args.dashboardUuid}`,
                );
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
