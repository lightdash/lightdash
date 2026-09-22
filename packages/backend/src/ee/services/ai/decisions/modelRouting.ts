import type { DecisionQuestion } from './AiDecisionClient';

export const SIMPLE_DATA_ANSWER_QUESTION: DecisionQuestion = {
    type: 'noul',
    instructions:
        'Is this structurally one straightforward warehouse lookup or aggregation that one semantic query can answer, possibly with ordinary filters, one time range or one grouping? Field IDs may still need catalog resolution. Counts and totals of a named entity are true, including all-time wording such as "so far", "in total" or no period at all. Requests needing multiple independent outputs, comparisons between periods or cohorts, explanations of causes, custom SQL, code, external tools, chart creation, or interpretation of previous conversation are false. Short follow-ups with an omitted subject are false.',
};
