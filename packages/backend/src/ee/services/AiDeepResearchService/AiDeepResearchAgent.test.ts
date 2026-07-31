import { type AiDeepResearchInvestigation } from '@lightdash/common';
import {
    getAiDeepResearchInvestigatorInstructions,
    getAiDeepResearchJudgeInstructions,
    getAiDeepResearchPlannerInstructions,
} from './AiDeepResearchAgent';

const hypothesis = {
    id: 'hypothesis-1',
    claim: 'Pricing drove the drop',
    rationale: 'The drop started the week prices changed',
    supportingEvidence: 'Order volume fell only in repriced categories',
    falsifyingEvidence: 'The drop also appears in unpriced categories',
};

const chartCandidate = {
    source: 'warehouse' as const,
    queryUuid: '11111111-1111-4111-8111-111111111111',
    title: 'Orders over time',
    chartConfig: {
        defaultVizType: 'line' as const,
        xAxisDimension: 'orders_created_month',
        yAxisMetrics: ['orders_count'],
        groupBy: null,
        xAxisType: 'time' as const,
        stackBars: null,
        lineType: 'line' as const,
        funnelDataInput: null,
        xAxisLabel: 'Month',
        yAxisLabel: 'Orders',
        secondaryYAxisMetric: null,
        secondaryYAxisLabel: null,
    },
};

describe('getAiDeepResearchPlannerInstructions', () => {
    it('demands exactly the configured number of hypotheses', () => {
        const instructions = getAiDeepResearchPlannerInstructions(4);

        expect(instructions).toContain('exactly 4');
        expect(instructions).toContain('submitResearchHypotheses');
        expect(instructions).toContain('falsif');
    });
});

describe('getAiDeepResearchInvestigatorInstructions', () => {
    it('embeds the single assigned hypothesis and its evidence criteria', () => {
        const instructions =
            getAiDeepResearchInvestigatorInstructions(hypothesis);

        expect(instructions).toContain('id="hypothesis-1"');
        expect(instructions).toContain(hypothesis.claim);
        expect(instructions).toContain(hypothesis.supportingEvidence);
        expect(instructions).toContain(hypothesis.falsifyingEvidence);
        expect(instructions).toContain('submitInvestigationReport');
        expect(instructions).toContain('untrusted');
    });
});

describe('getAiDeepResearchJudgeInstructions', () => {
    it('serializes completed reports and marks failed investigations unavailable', () => {
        const investigations: AiDeepResearchInvestigation[] = [
            {
                hypothesis,
                report: {
                    verdict: 'refuted',
                    summary: 'The drop predates the pricing change',
                    evidence: [
                        {
                            finding: 'Orders fell two weeks earlier',
                            queryUuids: ['query-1'],
                            sources: [],
                        },
                    ],
                    alternativeExplanations: ['Seasonality'],
                    causalLimitations: ['No controlled comparison'],
                    confidence: 'high',
                },
                failureReason: null,
            },
            {
                hypothesis: { ...hypothesis, id: 'hypothesis-2' },
                report: null,
                failureReason: 'investigator crashed',
            },
        ];

        const instructions = getAiDeepResearchJudgeInstructions(
            investigations,
            [chartCandidate],
        );

        expect(instructions).toContain('"verdict": "refuted"');
        expect(instructions).toContain('query-1');
        expect(instructions).toContain('"status": "unavailable"');
        expect(instructions).toContain('investigator crashed');
        expect(instructions).toContain('correlation');
        expect(instructions).toContain('untrusted');
        expect(instructions).toContain('submitResearchReport');
        expect(instructions).toContain(chartCandidate.queryUuid);
        expect(instructions).toContain('exactly one chart');
        expect(instructions).toContain('never submit a chartless finding');
    });
});
