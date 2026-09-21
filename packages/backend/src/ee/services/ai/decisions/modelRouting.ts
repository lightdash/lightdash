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
                    'Is this a complete, unambiguous request for one straightforward lookup or aggregation at one entity grain? Requests needing joins, comparison periods, multiple steps, explanations of causes, custom SQL, metric-definition choices, code, external tools or interpretation of previous conversation are false. If the required work is unclear, answer false.',
            },
        },
    });
    return (decisionProbability(answers?.simple) ?? 0) >= 0.99;
};
