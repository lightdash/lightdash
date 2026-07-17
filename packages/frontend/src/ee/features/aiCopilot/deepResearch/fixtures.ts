import {
    DimensionType,
    FieldType,
    MetricType,
    type AiDeepResearchChartDataMap,
} from '@lightdash/common';
import { type DeepResearchRunView } from './types';

const deepResearchChartQueryUuid = '7c4b40ba-79f8-4fd2-9c43-223eca8fa76f';

const deepResearchChartFixture = {
    queryUuid: deepResearchChartQueryUuid,
    title: 'Enterprise retention by incident exposure',
    chartConfig: {
        defaultVizType: 'bar' as const,
        xAxisDimension: 'incident_exposure',
        yAxisMetrics: ['renewed_arr', 'churned_arr'],
        groupBy: null,
        xAxisType: 'category' as const,
        stackBars: false,
        lineType: null,
        funnelDataInput: null,
        xAxisLabel: 'Incident exposure',
        yAxisLabel: 'Renewable ARR',
        secondaryYAxisMetric: null,
        secondaryYAxisLabel: null,
    },
};

const deepResearchReportMarkdownFixture = `Retention fell because three large customers reached renewal with unresolved reliability incidents. Adoption increased among retained accounts, but it did not offset the revenue concentration of those churns.

## Churn was concentrated in three incident-affected renewals

<confidence level="high">Support sentiment is incomplete for one churned account.</confidence>

The renewal cohort joins contracted ARR, renewal outcome, and production incident exposure for the quarter [1].

[${deepResearchChartFixture.title}](#chart-${deepResearchChartQueryUuid})

The concentration of churn among incident-exposed accounts makes reliability the strongest explanation for the quarter's retention decline.

<warning title="Data quality">

Support sentiment is **incomplete** for one churned account:

1. Missing exit-survey responses
2. Partial ticket history

</warning>

## Adoption gains occurred mostly in accounts that already renewed

<confidence level="medium">Association, not a controlled causal estimate.</confidence>

Weekly active seats rose, but the increase was strongest among healthy retained accounts and is not evidence that at-risk renewals recovered.

## Conclusion

- Reliability incidents, not adoption, explain the retention decline.
- Excluding incident-affected accounts would likely restore the adoption-retention relationship.

## Sources

1. [Q2 enterprise incident review](https://example.com/incident-review) — identifies repeated export failures for the affected accounts
`;

const numberMetric = (name: string, label: string) => ({
    name,
    label,
    table: 'renewals',
    tableLabel: 'Renewals',
    sql: '',
    hidden: false,
    fieldType: FieldType.METRIC as const,
    type: MetricType.NUMBER,
});

const deepResearchChartDataFixture: AiDeepResearchChartDataMap = {
    [deepResearchChartQueryUuid]: {
        source: 'warehouse',
        title: deepResearchChartFixture.title,
        chartConfig: deepResearchChartFixture.chartConfig,
        queryUuid: deepResearchChartQueryUuid,
        derivedFrom: null,
        metricQuery: {
            exploreName: 'renewals',
            dimensions: ['incident_exposure'],
            metrics: ['renewed_arr', 'churned_arr'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
        },
        fields: {
            incident_exposure: {
                name: 'incident_exposure',
                label: 'Incident exposure',
                table: 'renewals',
                tableLabel: 'Renewals',
                sql: '',
                hidden: false,
                fieldType: FieldType.DIMENSION as const,
                type: DimensionType.STRING,
            },
            renewed_arr: numberMetric('renewed_arr', 'Renewed ARR'),
            churned_arr: numberMetric('churned_arr', 'Churned ARR'),
        },
        snapshot: {
            takenAt: '2026-07-15T09:18:00.000Z',
            rowCount: 3,
            truncated: false,
            columnOrder: ['incident_exposure', 'renewed_arr', 'churned_arr'],
            rows: [
                ['No incidents', 4_200_000, 150_000],
                ['One incident', 1_600_000, 420_000],
                ['Repeated incidents', 380_000, 1_900_000],
            ],
        },
    },
};

export const deepResearchRunFixture: DeepResearchRunView = {
    uuid: 'run-quarterly-retention',
    projectUuid: 'project-1',
    threadUuid: 'thread-quarterly-retention',
    question:
        'Why did enterprise retention fall in Q2 despite higher product adoption?',
    depth: 'standard',
    status: 'completed',
    phase: 'Writing the report',
    startedAt: '2026-07-15T09:00:00.000Z',
    completedAt: '2026-07-15T09:18:00.000Z',
    elapsedMs: 1_080_000,
    sourceCount: 4,
    queryCount: 7,
    findingCount: 2,
    actionRequired: null,
    latestEvents: [
        {
            uuid: 'event-report',
            type: 'progress',
            label: 'Prepared the evidence-backed report',
            createdAt: '2026-07-15T09:18:00.000Z',
        },
        {
            uuid: 'event-query',
            type: 'progress',
            label: 'Executed a warehouse query',
            createdAt: '2026-07-15T09:12:00.000Z',
        },
    ],
    resultMarkdown: deepResearchReportMarkdownFixture,
    resultChartData: deepResearchChartDataFixture,
    errorMessage: null,
};
