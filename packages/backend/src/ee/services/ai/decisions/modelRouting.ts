import { AiDecisionClient, decisionProbability } from './AiDecisionClient';

export const canUseFastModel = async ({
    decisions,
    prompt,
    instructions,
}: {
    decisions: Pick<AiDecisionClient, 'evaluate'>;
    prompt: string;
    instructions: string | null;
}): Promise<boolean> => {
    const answers = await decisions.evaluate({
        operation: 'model-routing',
        state: { prompt, instructions },
        questions: {
            simple: {
                type: 'noul',
                instructions:
                    'Is this structurally one straightforward warehouse lookup or aggregation that can be answered by one semantic query, possibly with ordinary filters, one explicit time range, or one grouping? Field IDs may still need catalog resolution. A count of a named entity over an explicit period is true. Requests needing multiple independent outputs, comparisons between periods or cohorts, explanations of causes, custom SQL, code, external tools, chart creation, or interpretation of previous conversation are false. Short follow-ups with an omitted subject are false. If the requested work itself is unclear, answer false.',
            },
        },
    });
    return (decisionProbability(answers?.simple) ?? 0) >= 0.9;
};
