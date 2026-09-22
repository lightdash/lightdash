import type { AiQuickReply } from '@lightdash/common';
import {
    decisionProbability,
    type AiDecisionClient,
    type DecisionQuestion,
} from './AiDecisionClient';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 8;
const MAX_OPTION_LENGTH = 240;
const MAX_LABEL_LENGTH = 48;

export const QUICK_REPLY_THRESHOLDS = {
    clarifying: 0.6,
    option: 0.6,
} as const;

const stripMarkdown = (text: string) =>
    text
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();

// A leading bold phrase names the option; otherwise use the text before a dash or colon.
const labelOf = (item: string) => {
    const leadingBold = /^\*\*(.+?)\*\*/.exec(item.trim())?.[1];
    const head = stripMarkdown(leadingBold ?? item.split(/\s[–—-]\s|:\s/)[0]);
    if (head.length <= MAX_LABEL_LENGTH) return head;
    const cut = head.slice(0, MAX_LABEL_LENGTH - 1);
    return `${cut.slice(0, cut.lastIndexOf(' ')).trimEnd() || cut}…`;
};

/** List items of a reply that asks a question; JEV later decides which are real choices. */
export const findOptionCandidates = (response: string): AiQuickReply[] => {
    if (!response.includes('?')) return [];
    const items = response
        .split('\n')
        .map((line) => /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/.exec(line)?.[1])
        .filter((item): item is string => item !== undefined)
        .filter((item) => item.length <= MAX_OPTION_LENGTH);
    if (items.length < MIN_OPTIONS || items.length > MAX_OPTIONS) return [];
    const replies = items.map((item) => ({
        label: labelOf(item),
        prompt: stripMarkdown(item),
    }));
    const labels = new Set(replies.map(({ label }) => label));
    return labels.size === replies.length ? replies : [];
};

/** Offers the agent's own listed alternatives as one-click replies, never invented ones. */
export const selectQuickReplies = async ({
    decisions,
    question,
    response,
}: {
    decisions: Pick<AiDecisionClient, 'evaluate'>;
    question: string;
    response: string;
}): Promise<AiQuickReply[]> => {
    const candidates = findOptionCandidates(response);
    if (candidates.length === 0) return [];
    const questions: Record<string, DecisionQuestion> = {
        clarifying: {
            type: 'noul',
            instructions:
                'Does the assistant `response` end by asking the user to choose between alternatives before it can continue?',
        },
        ...Object.fromEntries(
            candidates.map((_, index) => [
                `option${index}`,
                {
                    type: 'noul' as const,
                    instructions: `Is \`options[${index}]\` one of the alternatives the user is being asked to choose between, rather than supporting detail, a caveat or a follow-up offer?`,
                },
            ]),
        ),
    };
    const answers = await decisions.evaluate({
        operation: 'quick-replies',
        state: {
            question,
            response,
            options: candidates.map(({ prompt }) => prompt),
        },
        questions,
    });
    if (
        !answers ||
        (decisionProbability(answers.clarifying) ?? 0) <
            QUICK_REPLY_THRESHOLDS.clarifying
    )
        return [];
    const selected = candidates.filter(
        (_, index) =>
            (decisionProbability(answers[`option${index}`]) ?? 0) >=
            QUICK_REPLY_THRESHOLDS.option,
    );
    return selected.length >= MIN_OPTIONS ? selected : [];
};
