import { describe, expect, it } from 'vitest';
import { getToolCallDisplayMessage } from './getToolCallDisplayMessage';

describe('getToolCallDisplayMessage', () => {
    it.each([
        ['createContent', 'running', 'Creating document'],
        ['createContent', 'done', 'Created document'],
        ['editContent', 'running', 'Editing document'],
        ['readContent', 'done', 'Read document'],
    ] as const)(
        'labels %s of a Document while %s',
        (toolName, status, label) => {
            expect(
                getToolCallDisplayMessage({
                    toolName,
                    status,
                    calls: [
                        {
                            toolCallId: 'call',
                            toolName,
                            toolArgs: { type: 'document' },
                        },
                    ],
                }),
            ).toBe(label);
        },
    );

    it('keeps the existing label for dashboards', () => {
        expect(
            getToolCallDisplayMessage({
                toolName: 'createContent',
                status: 'running',
                calls: [
                    {
                        toolCallId: 'call',
                        toolName: 'createContent',
                        toolArgs: { type: 'dashboard' },
                    },
                ],
            }),
        ).toBe('Creating dashboard');
    });
});
