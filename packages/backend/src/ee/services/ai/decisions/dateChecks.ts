import {
    DimensionType,
    getFields,
    getItemId,
    getTotalFilterRules,
    isDimension,
    TimeFrames,
    type Explore,
    type Filters,
} from '@lightdash/common';
import type { AgentDecisionContext } from './agentQuestion';
import {
    confidentChoice,
    decisionProbability,
    type DecisionAnswers,
    type DecisionQuestion,
} from './AiDecisionClient';
import { compareDatePeriod, getDatePeriodCandidates } from './dateRanges';

export const prepareDateCheck = ({
    question,
    conversation,
    explore,
}: {
    question: string;
    conversation?: AgentDecisionContext;
    explore: Explore;
}) => {
    const sources = [
        { source: 'Latest question', text: question },
        ...(conversation?.messages ?? [])
            .filter(
                (message) =>
                    message.role === 'user' && message.text !== question,
            )
            .map((message, index) => ({
                source: `Earlier user message ${index}`,
                text: message.text,
            })),
    ];
    if (sources.some((source) => source.text.length > 8_000)) return null;
    const allPeriods = sources.flatMap(({ source, text }) =>
        getDatePeriodCandidates(text).map((candidate) => ({
            ...candidate,
            source,
        })),
    );
    const seenPeriods = new Set<string>();
    const periods = allPeriods.filter(({ period }) => {
        const key = JSON.stringify(period);
        if (seenPeriods.has(key)) return false;
        seenPeriods.add(key);
        return true;
    });
    const fields = getFields(explore)
        .filter(isDimension)
        .filter(
            (field) =>
                (field.type === DimensionType.DATE ||
                    field.type === DimensionType.TIMESTAMP) &&
                (!field.timeInterval ||
                    field.timeInterval === TimeFrames.RAW) &&
                !field.customTimeInterval,
        );
    if (
        conversation?.incomplete ||
        !periods.length ||
        periods.length > 24 ||
        !fields.length ||
        fields.length > 40
    )
        return null;
    const questions: Record<string, DecisionQuestion> = {
        datePeriod: {
            type: 'choice',
            instructions:
                'Read only the user question and conversation. Which quoted phrase specifies the single period the user wants analyzed? Ignore the actual query filters: a wrong query must not affect this selection. Latest user scope overrides prior scope. Select an earlier phrase only for a continuation. Choose none for multiple periods, comparisons, fiscal calendars, examples, exclusions, timestamps, open-ended ranges, unclear endpoints or partial phrases. Do not calculate any dates.',
            criteria: {
                none: 'No single supported, unambiguous requested period.',
                ...Object.fromEntries(
                    periods.map((candidate, index) => [
                        String(index),
                        `${candidate.source}: ${JSON.stringify(candidate.text)}`,
                    ]),
                ),
            },
        },
        dateField: {
            type: 'choice',
            instructions:
                'Which date dimension expresses the business date requested by the user? Use the question, conversation and field/explore definitions. Ignore the actual query filters, which may be wrong. Choose none when there is no unique intended date field or different metrics need different date scopes.',
            criteria: {
                none: 'The intended business date is ambiguous or no date period was requested.',
                ...Object.fromEntries(
                    fields.map((field) => [
                        getItemId(field),
                        `${field.label}: ${field.description ?? ''}; SQL: ${field.sql}`,
                    ]),
                ),
            },
        },
        dateScopeInDefinitions: {
            type: 'noul',
            instructions:
                'Ignoring the explicit query filters, is any restriction on the requested date period already encoded in a selected metric definition, custom metric SQL, SQL parameter, required table filter or tableSqlFilters? A plain COUNT or SUM with no date predicate does not encode a period. Do not calculate or compare dates.',
        },
    };
    const compare = (answers: DecisionAnswers, filters: Filters) => {
        const periodKey = confidentChoice(answers.datePeriod, 0.95);
        const fieldId = confidentChoice(answers.dateField, 0.95);
        const embeddedScope = decisionProbability(
            answers.dateScopeInDefinitions,
        );
        if (
            periodKey === null ||
            periodKey === 'none' ||
            fieldId === null ||
            fieldId === 'none' ||
            embeddedScope === null ||
            embeddedScope > 0.15
        )
            return null;
        const candidate = periods.find(
            (_, index) => String(index) === periodKey,
        );
        const field = fields.find((entry) => getItemId(entry) === fieldId);
        if (!candidate || !field) return null;
        const dateIds = new Set(
            getFields(explore)
                .filter(
                    (entry) =>
                        entry.type === DimensionType.DATE ||
                        entry.type === DimensionType.TIMESTAMP,
                )
                .map(getItemId),
        );
        if (
            getTotalFilterRules(filters).some(
                (rule) =>
                    !rule.disabled &&
                    rule.target.fieldId !== fieldId &&
                    dateIds.has(rule.target.fieldId),
            )
        )
            return null;
        const outcome = compareDatePeriod({
            period: candidate.period,
            filters,
            fieldId,
            calendarDate: field.type === DimensionType.DATE,
        });
        return { outcome, fieldId, candidate };
    };
    return {
        questions,
        compare,
        advice: (answers: DecisionAnswers, filters: Filters): string[] => {
            const result = compare(answers, filters);
            return result?.outcome === 'mismatch'
                ? [
                      `The explicit date filters on ${result.fieldId} do not cover exactly ${JSON.stringify(result.candidate.text)} (${result.candidate.source}). Date bounds were compared in code. Check the intended period and any metric SQL, required filters or intermediate-query purpose before using these rows as the final answer. Preserve the requested scope.`,
                  ]
                : [];
        },
    };
};
