import {
    isToolEditDbtProjectResult,
    type AiAgentThread,
} from '@lightdash/common';

const DIFF_BLOCK = /```(?:diff|patch)[^\n]*\n([\s\S]*?)```/g;

/** The diffs the agent last proposed and no pull request carries yet, one per file; empty when there are none. */
export const getOpenProposal = (
    messages: AiAgentThread['messages'],
): string[] => {
    // A reply still being written or saved keeps the last one's proposal, so the change stays in view until the pull request has it.
    const settled = messages.filter(
        (message) =>
            message.role === 'assistant' &&
            message.status !== 'pending' &&
            !message.toolResults.some(
                (result) =>
                    isToolEditDbtProjectResult(result) &&
                    result.metadata.status === 'pending',
            ),
    );
    // A follow-up question does not drop the proposal; only a save does.
    for (const reply of settled.reverse()) {
        if (reply.role !== 'assistant') continue;
        const saves = reply.toolResults.filter(isToolEditDbtProjectResult);
        const hasFailed =
            saves.length > 0 &&
            saves.every(({ metadata }) => metadata.status === 'error');
        // A save that failed leaves the proposal to be saved again.
        if (
            !hasFailed &&
            reply.toolCalls.some(
                ({ toolName }) => toolName === 'editDbtProject',
            )
        )
            return [];
        const diffs = [...(reply.message ?? '').matchAll(DIFF_BLOCK)].map(
            ([, code]) => code,
        );
        if (diffs.length > 0) return diffs;
    }
    return [];
};

const pathOf = (patch: string) =>
    /^\+\+\+ (?:b\/)?(\S+)/m.exec(patch)?.[1] ?? null;

const addedLines = (patch: string) =>
    patch
        .split('\n')
        .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
        .map((line) => line.slice(1).trim())
        .filter(Boolean);

/** A proposed diff is saved once the pull request adds every line it adds, to the same file, however it got there. */
export const isInPullRequest = (proposed: string, pullRequestDiff: string) => {
    const path = pathOf(proposed);
    const added = addedLines(proposed);
    if (!path || added.length === 0) return false;
    const file = pullRequestDiff.split(/\n(?=diff --git )/).find((section) => {
        const filePath = pathOf(section);
        return (
            !!filePath &&
            (filePath === path ||
                filePath.endsWith(`/${path}`) ||
                path.endsWith(`/${filePath}`))
        );
    });
    if (!file) return false;
    const inPullRequest = new Set(addedLines(file));
    return added.every((line) => inPullRequest.has(line));
};
