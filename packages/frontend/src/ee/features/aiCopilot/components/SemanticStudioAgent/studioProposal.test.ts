import { type AiAgentThread } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getOpenProposal, isInPullRequest } from './studioProposal';

const thread = (
    ...replies: {
        message: string;
        tools?: string[];
        pending?: boolean;
        saving?: boolean;
    }[]
): AiAgentThread['messages'] =>
    replies.map(({ message, tools = [], pending = false, saving = false }) => ({
        role: 'assistant',
        status: pending ? 'pending' : 'idle',
        message,
        toolCalls: tools.map((toolName) => ({ toolName })),
        toolResults: saving
            ? [
                  {
                      toolType: 'built-in',
                      toolName: 'editDbtProject',
                      metadata: {
                          status: 'pending',
                          aiWritebackRunUuid: 'run',
                      },
                  },
              ]
            : [],
    })) as unknown as AiAgentThread['messages'];

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
