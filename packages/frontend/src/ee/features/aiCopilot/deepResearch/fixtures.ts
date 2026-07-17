import { type DeepResearchRunView } from './types';

const deepResearchChartFixture = {
    queryUuid: '7c4b40ba-79f8-4fd2-9c43-223eca8fa76f',
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

\`\`\`chart
${JSON.stringify(deepResearchChartFixture)}
\`\`\`

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
    errorMessage: null,
};
