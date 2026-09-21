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
    const requests = [
        ...question.matchAll(
            /\b(top|bottom)\s+([1-9]\d{0,5})(?!\d|[.,]\d|\s*%)\b/gi,
        ),
    ].map((match) => ({
        text: match[0],
        limit: Number(match[2]),
        descending: match[1].toLowerCase() === 'top',
    }));
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
                'Which quoted phrase explicitly requests a single global top or bottom N result in the latest user question? Read the question and conversation, ignoring the actual sort and limit. Choose none for negated requests, examples, percentages, multiple rankings, per-group rankings, ties, rank ranges or a meaning not exactly represented by the phrase. Top means highest measure values; bottom means lowest. Do not compute anything.',
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
            const measureId = confidentChoice(answers.rankingMeasure, 0.95);
            const request = requests.find(
                (_, index) => String(index) === requestKey,
            );
            if (
                !request ||
                !fields.some((field) => getItemId(field) === measureId)
            )
                return [];
            const sort = query.sorts[0];
            // Pivoted ranks need the requested pivot cell, not only a field ID.
            if (sort?.pivotValues?.length) return [];
            const issues: string[] = [];
            if (
                !sort ||
                sort.fieldId !== measureId ||
                sort.descending !== request.descending
            ) {
                issues.push(
                    `sort first by ${measureId} ${request.descending ? 'descending' : 'ascending'}`,
                );
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
