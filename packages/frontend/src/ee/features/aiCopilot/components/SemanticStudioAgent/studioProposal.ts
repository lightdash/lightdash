import { type AiAgentThread } from '@lightdash/common';

const DIFF_BLOCK = /```(?:diff|patch)[^\n]*\n([\s\S]*?)```/g;

/** The diffs the agent's latest reply proposes and no pull request carries yet, one per file; empty when there are none. */
export const getOpenProposal = (
    messages: AiAgentThread['messages'],
): string[] => {
    // A reply still being written keeps the last one's proposal, so asking to save it does not empty the view.
    const last = messages.findLast(
        (message) =>
            message.role === 'assistant' && message.status !== 'pending',
    );
    if (
        last?.role !== 'assistant' ||
        last.toolCalls.some(({ toolName }) => toolName === 'editDbtProject')
    ) {
        return [];
    }
    return [...(last.message ?? '').matchAll(DIFF_BLOCK)].map(
        ([, code]) => code,
    );
};
