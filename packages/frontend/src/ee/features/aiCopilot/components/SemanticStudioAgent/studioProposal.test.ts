import { type AiAgentThread } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getOpenProposal } from './studioProposal';

const thread = (
    ...replies: { message: string; tools?: string[] }[]
): AiAgentThread['messages'] =>
    replies.map(({ message, tools = [] }) => ({
        role: 'assistant',
        message,
        toolCalls: tools.map((toolName) => ({ toolName })),
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
});
