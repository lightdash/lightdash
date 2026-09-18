import {
    analyzeFieldImpactToolDefinition,
    type FieldImpactReport,
    type ToolAnalyzeFieldImpactStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    AnalyzeFieldImpactFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    analyzeFieldImpact: AnalyzeFieldImpactFn;
    updateProgress: UpdateProgressFn;
};

const toolDefinition = analyzeFieldImpactToolDefinition.for('agent');

// Only what the model is shown: strips project/space uuids and dependent metric labels.
const toStructuredContent = (
    report: FieldImpactReport,
): ToolAnalyzeFieldImpactStructuredContent => ({
    fieldId: report.fieldId,
    fieldType: report.fieldType,
    severity: report.severity,
    summary: report.summary,
    charts: report.charts.map((chart) => ({
        uuid: chart.uuid,
        name: chart.name,
        spaceName: chart.spaceName,
        dashboardName: chart.dashboardName,
        viewsCount: chart.viewsCount,
    })),
    dashboards: report.dashboards.map((dashboard) => ({
        uuid: dashboard.uuid,
        name: dashboard.name,
        viaChartName: dashboard.viaChartName,
    })),
    dashboardFilterTargets: report.dashboardFilterTargets.map((dashboard) => ({
        uuid: dashboard.uuid,
        name: dashboard.name,
    })),
    metricTreeDependents: report.metricTreeDependents.map((metric) => ({
        fieldId: metric.fieldId,
    })),
    scheduledDeliveries: report.scheduledDeliveries.map((delivery) => ({
        name: delivery.name,
        savedChartUuid: delivery.savedChartUuid,
        dashboardUuid: delivery.dashboardUuid,
    })),
});

const generateResponse = (report: ToolAnalyzeFieldImpactStructuredContent) => (
    <fieldImpact
        fieldId={report.fieldId}
        fieldType={report.fieldType ?? 'unknown'}
        severity={report.severity}
        chartCount={report.summary.charts}
        dashboardCount={report.summary.dashboards}
        dashboardFilterCount={report.summary.dashboardFilterTargets}
        dependentMetricCount={report.summary.metricTreeDependents}
        scheduledDeliveryCount={report.summary.scheduledDeliveries}
    >
        <note>
            These references are exact (queried from saved content), not a fuzzy
            search. "breaking" means at least one chart, dependent metric or
            dashboard filter references this field and will break if it is
            removed. This does NOT detect silent value-drift: if the field id
            stays the same but its underlying SQL/aggregation changes, numbers
            can move without anything appearing here.
        </note>
        {report.charts.length > 0 && (
            <charts>
                {report.charts.map((chart) => (
                    <chart
                        uuid={chart.uuid}
                        name={chart.name}
                        space={chart.spaceName}
                        dashboard={chart.dashboardName ?? undefined}
                        views={chart.viewsCount}
                    />
                ))}
            </charts>
        )}
        {report.dashboards.length > 0 && (
            <dashboards>
                {report.dashboards.map((dashboard) => (
                    <dashboard
                        uuid={dashboard.uuid}
                        name={dashboard.name}
                        viaChart={dashboard.viaChartName}
                    />
                ))}
            </dashboards>
        )}
        {report.dashboardFilterTargets.length > 0 && (
            <dashboardFilters>
                {report.dashboardFilterTargets.map((dashboard) => (
                    <dashboard uuid={dashboard.uuid} name={dashboard.name} />
                ))}
            </dashboardFilters>
        )}
        {report.metricTreeDependents.length > 0 && (
            <dependentMetrics note="metrics built on this metric — break with no chart between them">
                {report.metricTreeDependents.map((metric) => (
                    <metric fieldId={metric.fieldId} />
                ))}
            </dependentMetrics>
        )}
        {report.scheduledDeliveries.length > 0 && (
            <scheduledDeliveries>
                {report.scheduledDeliveries.map((delivery) => (
                    <delivery
                        name={delivery.name}
                        savedChartUuid={delivery.savedChartUuid ?? undefined}
                        dashboardUuid={delivery.dashboardUuid ?? undefined}
                    />
                ))}
            </scheduledDeliveries>
        )}
    </fieldImpact>
);

export const getAnalyzeFieldImpact = ({
    analyzeFieldImpact,
    updateProgress,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (
            args,
        ): Promise<
            | ExecuteStructuredToolResult<ToolAnalyzeFieldImpactStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                await updateProgress(
                    `Analyzing the impact of changing "${args.fieldId}"...`,
                );

                const report = await analyzeFieldImpact({
                    fieldId: args.fieldId,
                });

                const structuredContent = toStructuredContent(report);

                return {
                    result: generateResponse(structuredContent).toString(),
                    metadata: {
                        status: 'success',
                    },
                    structuredContent,
                };
            } catch (error) {
                return toolErrorOutput(
                    error,
                    `Error analyzing the impact of "${args.fieldId}".`,
                );
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
