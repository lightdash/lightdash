import { analyzeFieldImpactToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type {
    AnalyzeFieldImpactFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    analyzeFieldImpact: AnalyzeFieldImpactFn;
    updateProgress: UpdateProgressFn;
};

const toolDefinition = analyzeFieldImpactToolDefinition.for('agent');

const generateResponse = (
    report: Awaited<ReturnType<AnalyzeFieldImpactFn>>,
) => (
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
        execute: async (args) => {
            try {
                await updateProgress(
                    `Analyzing the impact of changing "${args.fieldId}"...`,
                );

                const report = await analyzeFieldImpact({
                    fieldId: args.fieldId,
                });

                return {
                    result: generateResponse(report).toString(),
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        `Error analyzing the impact of "${args.fieldId}".`,
                    ),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
