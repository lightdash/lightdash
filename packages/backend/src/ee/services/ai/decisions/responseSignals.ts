import { AiDecisionClient, decisionProbability } from './AiDecisionClient';

export const classifyResponseSignals = async (
    decisions: Pick<AiDecisionClient, 'evaluate'>,
    response: string,
): Promise<{
    needsUserInput: boolean | null;
    refused: boolean | null;
    inputProbability: number | null;
}> => {
    const answers = await decisions.evaluate({
        operation: 'response-signals',
        state: { response },
        questions: {
            blocking: {
                type: 'noul',
                instructions:
                    'Does the assistant response require the user to supply missing information or choose an option before the current task can continue? Optional follow-up offers, rhetorical questions and refusals do not require input. Evaluate meaning in the language used, not punctuation.',
            },
            refused: {
                type: 'noul',
                instructions:
                    'Does the assistant decline or state it cannot fulfill the current request? A completed answer with a caveat or an enthusiastic phrase such as I cannot wait does not count as refusal.',
            },
        },
    });
    const inputProbability = decisionProbability(answers?.blocking);
    const refusalProbability = decisionProbability(answers?.refused);
    const classify = (value: number | null) => {
        if (value === null || (value > 0.15 && value < 0.85)) return null;
        return value >= 0.85;
    };
    return {
        needsUserInput: classify(inputProbability),
        refused: classify(refusalProbability),
        inputProbability,
    };
};
