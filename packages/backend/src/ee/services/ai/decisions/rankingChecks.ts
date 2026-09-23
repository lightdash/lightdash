import {
    getFields,
    getItemId,
    isMetric,
    type Explore,
} from '@lightdash/common';
import type { AgentDecisionContext } from './agentQuestion';
import {
    confidentChoice,
    type DecisionAnswers,
    type DecisionQuestion,
} from './AiDecisionClient';
import type { ReviewableMetricQuery } from './queryChecks';

const COUNT_WORDS: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
};

export const prepareRankingCheck = ({
    question,
    conversation,
    explore,
    query,
}: {
    question: string;
    conversation?: AgentDecisionContext;
    explore: Explore;
    query: ReviewableMetricQuery;
}) => {
    if (question.length > 8_000 || conversation?.incomplete) return null;
    // Extract literal counts, leaving their meaning and ranking direction to
    // JEV. The earlier "top/bottom + digits" gate hid valid phrasings from it.
    const requests = [
        ...[
            ...question.matchAll(
                /(?<![\d.,])([1-9]\d{0,5})(?!\d|[.,]\d|\s*%)/g,
            ),
        ].map((match) => ({ text: match[0], limit: Number(match[1]) })),
        ...[...question.matchAll(/\b[a-z]+\b/gi)].flatMap((match) => {
            const word = match[0].toLowerCase();
            const limit = Object.hasOwn(COUNT_WORDS, word)
                ? COUNT_WORDS[word]
                : null;
            return limit ? [{ text: match[0], limit }] : [];
        }),
    ];
    const fields = getFields(explore)
        .filter(isMetric)
        .filter((field) => query.metrics.includes(getItemId(field)));
    if (
        !requests.length ||
        requests.length > 8 ||
        !fields.length ||
        fields.length > 40
    )
        return null;
    const questions: Record<string, DecisionQuestion> = {
        rankingRequest: {
            type: 'choice',
            instructions:
                'Which quoted literal count is the row limit explicitly requested for one global highest or lowest ranking in the latest user question? Read the question and conversation, ignoring the actual sort and limit. Choose none for negated requests, examples, percentages, multiple rankings, per-group rankings, ties, rank ranges or a count with another meaning. Do not compute or infer an unstated count.',
            criteria: {
                none: 'No single supported global ranking request.',
                ...Object.fromEntries(
                    requests.map((request, index) => [
                        String(index),
                        JSON.stringify(request.text),
                    ]),
                ),
            },
        },
        rankingDirection: {
            type: 'choice',
            instructions:
                'Does the latest user question request a single global ranking by highest or lowest measure values? Choose descending for highest, most, top or equivalent wording; ascending for lowest, least, bottom or equivalent wording. Choose none for negated requests, examples, per-group rankings, multiple rankings, rank ranges or ambiguous direction. Do not use the query sort to decide.',
            criteria: {
                descending: 'Highest measure values first.',
                ascending: 'Lowest measure values first.',
                none: 'No single supported global ranking direction.',
            },
        },
        rankingMeasure: {
            type: 'choice',
            instructions:
                'Which selected metric is the measure explicitly used to rank the results in the user request? Ignore the actual sort. Use field definitions and prior scope only to resolve the measure. Choose none if it is missing, ambiguous, a formula or dimension not listed, or if top/bottom has a different meaning.',
            criteria: {
                none: 'No uniquely identified ranking measure in this list.',
                ...Object.fromEntries(
                    fields.map((field) => [
                        getItemId(field),
                        `${field.label}: ${(field.description ?? '').slice(0, 400)}; SQL: ${field.sql.slice(0, 400)}`,
                    ]),
                ),
            },
        },
    };
    return {
        questions,
        advice: (answers: DecisionAnswers): string[] => {
            const requestKey = confidentChoice(answers.rankingRequest, 0.95);
            const direction = confidentChoice(answers.rankingDirection, 0.95);
            const measureId = confidentChoice(answers.rankingMeasure, 0.95);
            const request = requests.find(
                (_, index) => String(index) === requestKey,
            );
            if (
                !request ||
                (direction !== 'descending' && direction !== 'ascending') ||
                !fields.some((field) => getItemId(field) === measureId)
            )
                return [];
            const descending = direction === 'descending';
            const sort = query.sorts[0];
            // Pivoted ranks need the requested pivot cell, not only a field ID.
            if (sort?.pivotValues?.length) return [];
            const issues: string[] = [];
            if (
                !sort ||
                sort.fieldId !== measureId ||
                sort.descending !== descending
            ) {
                issues.push(`sort first by ${measureId} ${direction}`);
            }
            if (query.limit !== request.limit)
                issues.push(
                    `return ${request.limit} rows (subject to the execution limit)`,
                );
            return issues.length
                ? [
                      `For ${JSON.stringify(request.text)}, ${issues.join(' and ')}. Sort direction and row limit were compared in code. Check whether this is an intermediate query before using it as the final ranking.`,
                  ]
                : [];
        },
    };
};
