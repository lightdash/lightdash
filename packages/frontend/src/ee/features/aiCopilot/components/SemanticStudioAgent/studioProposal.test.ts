import { type AiAgentThread } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getOpenProposal,
    getSavingChange,
    isInPullRequest,
} from './studioProposal';

const PR_URL = 'https://github.com/acme/analytics/pull/7';

const thread = (
    ...replies: {
        message: string;
        tools?: string[];
        pending?: boolean;
        saving?: boolean;
        failed?: boolean;
        saved?: boolean;
        diffs?: string[];
    }[]
): AiAgentThread['messages'] =>
    replies.map(
        ({
            message,
            tools = [],
            pending = false,
            saving = false,
            failed = false,
            saved = false,
            diffs,
        }) => ({
            role: 'assistant',
            status: pending ? 'pending' : 'idle',
            message,
            toolCalls: tools.map((toolName) => ({ toolName })),
            toolResults:
                saving || failed || saved
                    ? [
                          {
                              toolType: 'built-in',
                              toolName: 'editDbtProject',
                              toolCallId: 'call',
                              metadata: failed
                                  ? { status: 'error', errorCode: 'unknown' }
                                  : saved
                                    ? { status: 'success', prUrl: PR_URL }
                                    : {
                                          status: 'pending',
                                          aiWritebackRunUuid: 'run',
                                          diffs,
                                      },
                          },
                      ]
                    : [],
        }),
    ) as unknown as AiAgentThread['messages'];

describe('getOpenProposal', () => {
    it('returns each diff block of the latest reply', () => {
        expect(
            getOpenProposal(
                thread({
                    message:
                        'Here.\n```diff\n--- a/x.yml\n+++ b/x.yml\n@@ -1 +1 @@\n-a\n+b\n```\nand\n```diff\n+++ b/y.yml\n```',
                }),
            ),
        ).toEqual([
            '--- a/x.yml\n+++ b/x.yml\n@@ -1 +1 @@\n-a\n+b\n',
            '+++ b/y.yml\n',
        ]);
    });

    it('keeps the proposal when saving it failed', () => {
        expect(
            getOpenProposal(
                thread(
                    { message: '```diff\n+a\n```' },
                    {
                        message: 'Saving it now.',
                        tools: ['editDbtProject'],
                        failed: true,
                    },
                ),
            ),
        ).toEqual(['+a\n']);
    });

    it('is empty once the reply saved to a pull request, or proposes nothing', () => {
        expect(
            getOpenProposal(
                thread({
                    message: '```diff\n+a\n```',
                    tools: ['editDbtProject'],
                }),
            ),
        ).toEqual([]);
        expect(
            getOpenProposal(thread({ message: 'No change needed.' })),
        ).toEqual([]);
    });

    it('keeps the proposal through a follow-up that proposes nothing', () => {
        expect(
            getOpenProposal(
                thread(
                    { message: '```diff\n+a\n```' },
                    { message: 'It renames the column.' },
                ),
            ),
        ).toEqual(['+a\n']);
    });

    it('keeps the proposal while the reply asked to save it is still being written', () => {
        const proposed = { message: '```diff\n+a\n```' };
        expect(
            getOpenProposal(
                thread(proposed, {
                    message: '',
                    tools: ['editDbtProject'],
                    pending: true,
                }),
            ),
        ).toEqual(['+a\n']);
        expect(
            getOpenProposal(
                thread(proposed, {
                    message: 'Opened it.',
                    tools: ['editDbtProject'],
                }),
            ),
        ).toEqual([]);
    });

    it('keeps the proposal while the save it asked for is still running', () => {
        expect(
            getOpenProposal(
                thread(
                    { message: '```diff\n+a\n```' },
                    {
                        message: 'Saving it.',
                        tools: ['editDbtProject'],
                        saving: true,
                    },
                ),
            ),
        ).toEqual(['+a\n']);
    });
});

describe('isInPullRequest', () => {
    const proposed = [
        '--- a/models/customers.yml',
        '+++ b/models/customers.yml',
        '@@ -39,2 +39,1 @@',
        '-      old',
        '+      One row per customer.',
    ].join('\n');
    const pullRequest = (added: string) =>
        [
            'diff --git a/models/customers.yml b/models/customers.yml',
            '--- a/models/customers.yml',
            '+++ b/models/customers.yml',
            '@@ -39,2 +39,1 @@',
            '-      old',
            `+      ${added}`,
        ].join('\n');

    it('counts a proposal saved by hand as saved', () => {
        expect(
            isInPullRequest(proposed, pullRequest('One row per customer.')),
        ).toBe(true);
    });

    it('keeps a proposal the pull request does not carry', () => {
        expect(isInPullRequest(proposed, pullRequest('Something else.'))).toBe(
            false,
        );
        expect(isInPullRequest(proposed, '')).toBe(false);
    });
});

describe('getSavingChange', () => {
    const diffs = ['--- a/x.yml\n+++ b/x.yml\n@@ -1,1 +1,1 @@\n-a\n+b\n'];
    const proposed = { message: '```diff\n+a\n```' };
    const running = thread(proposed, {
        message: 'Saving.',
        tools: ['editDbtProject'],
        saving: true,
        diffs,
    });

    it('shows what a running save writes', () => {
        expect(getSavingChange(running, null, true)).toEqual({
            toolCallId: 'call',
            diffs,
        });
    });

    it('keeps it once the commit lands, until the pull request diff is read at it', () => {
        const shown = getSavingChange(running, null, true);
        const landed = thread(proposed, {
            message: 'Saved.',
            tools: ['editDbtProject'],
            saved: true,
        });
        expect(getSavingChange(landed, shown, false)).toBe(shown);
        expect(getSavingChange(landed, shown, true)).toBe(null);
        expect(getSavingChange(landed, null, false)).toBe(null);
    });

    it('drops it when the save fails, so the proposal comes back as not saved', () => {
        const shown = getSavingChange(running, null, true);
        const failed = thread(proposed, {
            message: 'Saving.',
            tools: ['editDbtProject'],
            failed: true,
        });
        expect(getSavingChange(failed, shown, false)).toBe(null);
        expect(getOpenProposal(failed)).toEqual(['+a\n']);
    });

    it('has nothing for a save in the sandbox, which leaves the proposal as it was', () => {
        const sandbox = thread(proposed, {
            message: 'Saving.',
            tools: ['editDbtProject'],
            saving: true,
        });
        expect(getSavingChange(sandbox, null, true)).toBe(null);
        expect(getOpenProposal(sandbox)).toEqual(['+a\n']);
    });

    it('is not shown again once the pull request carries it', () => {
        expect(
            isInPullRequest(
                diffs[0],
                'diff --git a/dbt/x.yml b/dbt/x.yml\n--- a/dbt/x.yml\n+++ b/dbt/x.yml\n@@ -1 +1 @@\n-a\n+b\n',
            ),
        ).toBe(true);
    });
});
