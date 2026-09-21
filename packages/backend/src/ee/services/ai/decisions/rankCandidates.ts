import {
    AiDecisionClient,
    decisionProbability,
    DecisionQuestion,
} from './AiDecisionClient';

export const rankCandidates = async <T>({
    decisions,
    query,
    candidates,
    describe,
    operation,
    assessAmbiguity = false,
    relevanceInstructions = "Answer the user's query with the requested entity, meaning and aggregation. Related vocabulary alone is insufficient.",
}: {
    decisions: Pick<AiDecisionClient, 'evaluate'>;
    query: string;
    candidates: T[];
    describe: (candidate: T) => unknown;
    operation: string;
    assessAmbiguity?: boolean;
    relevanceInstructions?: string;
}): Promise<{
    candidates: T[];
    ambiguous: boolean | null;
    ranked: boolean;
}> => {
    const shortlist = candidates.slice(0, 30);
    if (shortlist.length === 0)
        return { candidates, ambiguous: null, ranked: false };
    const questions: Record<string, DecisionQuestion> = Object.fromEntries(
        shortlist.map((_, index) => [
            `fit_${index}`,
            {
                type: 'noul',
                instructions: `Does candidates[${index}] satisfy this relevance criterion? ${relevanceInstructions}`,
            },
        ]),
    );
    if (assessAmbiguity) {
        questions.ambiguous = {
            type: 'noul',
            instructions:
                'Do the candidates contain competing definitions for the requested measure or entity that the query does not distinguish? Fields needed together to answer a specific query are not ambiguity. Duplicates of the same definition reached through different explores are not ambiguity.',
        };
    }
    const answers = await decisions.evaluate({
        operation,
        state: { query, candidates: shortlist.map(describe) },
        questions,
    });
    if (!answers) return { candidates, ambiguous: null, ranked: false };
    const ambiguity = decisionProbability(answers.ambiguous);
    const strongestFit = Math.max(
        ...shortlist.map(
            (_, index) => decisionProbability(answers[`fit_${index}`]) ?? 0,
        ),
    );
    if (strongestFit < 0.85)
        return {
            candidates,
            ambiguous: ambiguity !== null && ambiguity >= 0.85 ? true : null,
            ranked: false,
        };
    const ranked = shortlist
        .map((candidate, index) => ({
            candidate,
            index,
            fit: decisionProbability(answers[`fit_${index}`]) ?? 0,
        }))
        .sort((a, b) => b.fit - a.fit || a.index - b.index)
        .map(({ candidate }) => candidate);
    return {
        candidates: [...ranked, ...candidates.slice(shortlist.length)],
        ambiguous:
            ambiguity === null || (ambiguity > 0.15 && ambiguity < 0.85)
                ? null
                : ambiguity >= 0.85,
        ranked: true,
    };
};
