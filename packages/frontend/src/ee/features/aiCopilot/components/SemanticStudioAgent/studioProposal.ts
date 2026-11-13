import { type AiAgentThread } from '@lightdash/common';

const DIFF_BLOCK = /```(?:diff|patch)[^\n]*\n([\s\S]*?)```/g;

/** The diffs the agent's latest reply proposes and no pull request carries yet, one per file; empty when there are none. */
export const getOpenProposal = (
    messages: AiAgentThread['messages'],
): string[] => {
    const last = messages.findLast(({ role }) => role === 'assistant');
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
