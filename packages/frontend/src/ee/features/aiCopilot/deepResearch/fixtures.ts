import { type DeepResearchRunView } from './types';

export const deepResearchRunFixture: DeepResearchRunView = {
    uuid: 'run-quarterly-retention',
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
    artifact: {
        executiveAnswer:
            'Retention fell because three large customers reached renewal with unresolved reliability incidents. Adoption increased among retained accounts, but it did not offset the revenue concentration of those churns.',
        findings: [
            {
                uuid: 'finding-renewals',
                title: 'Churn was concentrated in three incident-affected renewals',
                summary:
                    'Three enterprise accounts represented 71% of Q2 churned ARR. Each recorded multiple severity-one incidents in the 60 days before renewal.',
                confidence: 'high',
                evidence: [
                    {
                        uuid: 'evidence-retention-query',
                        title: 'Enterprise renewal cohort by incident exposure',
                        description:
                            'The renewal cohort query joins contracted ARR, renewal outcome, and production incident exposure for Q2.',
                        sourceType: 'lightdash',
                        sourceLabel: 'Project data',
                        sourceUrl:
                            '/projects/project-1/queries/7c4b40ba-79f8-4fd2-9c43-223eca8fa76f',
                        queryUuid: '7c4b40ba-79f8-4fd2-9c43-223eca8fa76f',
                        metrics: [
                            'Renewed ARR',
                            'Churned ARR',
                            'Incident count',
                        ],
                        filters: [
                            'Segment is Enterprise',
                            'Renewal quarter is 2026 Q2',
                        ],
                        dateRange: '1 April–30 June 2026',
                    },
                    {
                        uuid: 'evidence-incident-review',
                        title: 'Q2 enterprise incident review',
                        description:
                            'The support review identifies repeated export failures and delayed incident follow-up for the affected accounts.',
                        sourceType: 'document',
                        sourceLabel: 'Knowledge',
                        sourceUrl: null,
                        queryUuid: null,
                        metrics: [],
                        filters: [],
                        dateRange: null,
                    },
                ],
            },
            {
                uuid: 'finding-adoption',
                title: 'Adoption gains occurred mostly in accounts that already renewed',
                summary:
                    'Weekly active seats rose 14%, but the increase was strongest among healthy retained accounts and is not evidence that at-risk renewals recovered.',
                confidence: 'medium',
                evidence: [
                    {
                        uuid: 'evidence-adoption-query',
                        title: 'Seat adoption by renewal outcome',
                        description:
                            'Usage is segmented by renewal outcome to avoid conflating retained-account expansion with churn prevention.',
                        sourceType: 'warehouse',
                        sourceLabel: 'Warehouse query',
                        sourceUrl: null,
                        queryUuid: 'aab39aec-c169-40ed-83aa-86cd8da1a7dd',
                        metrics: ['Weekly active seats'],
                        filters: ['Segment is Enterprise'],
                        dateRange: '1 January–30 June 2026',
                    },
                ],
            },
        ],
        contradictoryEvidence: [
            'One churned customer had high adoption and no recorded severity-one incident, suggesting procurement pressure was also involved.',
        ],
        definitionsAndMethodology:
            'Enterprise means accounts with at least £100k contracted ARR. Retention is measured on renewable ARR. The analysis compared Q2 renewal cohorts, incident records, usage, and support reviews.',
        confidence: 'high',
        limitations: [
            'Support sentiment is incomplete for one churned account.',
            'The analysis establishes a strong association, not a controlled causal estimate.',
        ],
        nextQuestions: [
            'Which open reliability issues affect enterprise accounts renewing in Q3?',
            'Would excluding incident-affected accounts change the adoption-retention relationship?',
        ],
    },
    errorMessage: null,
};
