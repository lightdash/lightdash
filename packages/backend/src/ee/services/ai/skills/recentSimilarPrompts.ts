import type { AiAgentRecentUserPrompt } from '../../../models/AiAgentReviewClassifierModel';

export type AiAgentReviewSimilarPrompt = {
    threadUuid: string;
    createdAt: string;
    text: string;
    similarity: number;
};

// Counts are over the matched prompts so the judge sees how many threads and
// people repeat the request without reading every row.
export type AiAgentReviewRecentSimilarPrompts = {
    windowDays: number;
    threadCount: number;
    userCount: number;
    prompts: AiAgentReviewSimilarPrompt[];
};

export const RECENT_SIMILAR_PROMPTS_WINDOW_DAYS = 30;
export const RECENT_SIMILAR_PROMPTS_MAX_CANDIDATES = 300;
const MIN_SIMILARITY = 0.3;
const MAX_PROMPTS = 8;
const MAX_TEXT_LENGTH = 400;

// Function words plus period vocabulary: the same report asked for a different
// month or week must still read as the same request.
const IGNORED_TOKENS = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'that',
    'this',
    'please',
    'can',
    'you',
    'give',
    'show',
    'get',
    'want',
    'need',
    'now',
    'run',
    'also',
    'but',
    'then',
    'into',
    'over',
    'per',
    'all',
    'any',
    'our',
    'your',
    'their',
    'what',
    'which',
    'how',
    'much',
    'many',
    'last',
    'next',
    'previous',
    'ending',
    'starting',
    'since',
    'until',
    'ago',
    'today',
    'yesterday',
    'tomorrow',
    'usual',
    'again',
    'always',
    'whenever',
    'every',
    'time',
    'like',
    'same',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
    'jan',
    'feb',
    'mar',
    'apr',
    'jun',
    'jul',
    'aug',
    'sep',
    'sept',
    'oct',
    'nov',
    'dec',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
]);

const tokenize = (text: string): Set<string> =>
    new Set(
        text
            .toLowerCase()
            .replace(/[^a-z\s]/g, ' ')
            .split(/\s+/)
            .filter((token) => token.length >= 3 && !IGNORED_TOKENS.has(token)),
    );

const jaccard = (a: Set<string>, b: Set<string>): number => {
    if (a.size === 0 || b.size === 0) return 0;
    const shared = [...a].filter((token) => b.has(token)).length;
    return shared / (a.size + b.size - shared);
};

const truncate = (text: string): string =>
    text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}…` : text;

export const emptyRecentSimilarPrompts =
    (): AiAgentReviewRecentSimilarPrompts => ({
        windowDays: RECENT_SIMILAR_PROMPTS_WINDOW_DAYS,
        threadCount: 0,
        userCount: 0,
        prompts: [],
    });

export const rankRecentSimilarPrompts = (
    currentPrompt: string,
    candidates: AiAgentRecentUserPrompt[],
): AiAgentReviewRecentSimilarPrompts => {
    const current = tokenize(currentPrompt);
    const matched = candidates
        .map((candidate) => ({
            candidate,
            similarity: jaccard(current, tokenize(candidate.text)),
        }))
        .filter(({ similarity }) => similarity >= MIN_SIMILARITY)
        .sort((a, b) => b.similarity - a.similarity);

    return {
        windowDays: RECENT_SIMILAR_PROMPTS_WINDOW_DAYS,
        threadCount: new Set(matched.map((m) => m.candidate.threadUuid)).size,
        userCount: new Set(
            matched
                .map((m) => m.candidate.userUuid)
                .filter((userUuid): userUuid is string => userUuid !== null),
        ).size,
        prompts: matched
            .slice(0, MAX_PROMPTS)
            .map(({ candidate, similarity }) => ({
                threadUuid: candidate.threadUuid,
                createdAt: candidate.createdAt.toISOString(),
                text: truncate(candidate.text),
                similarity: Math.round(similarity * 100) / 100,
            })),
    };
};
