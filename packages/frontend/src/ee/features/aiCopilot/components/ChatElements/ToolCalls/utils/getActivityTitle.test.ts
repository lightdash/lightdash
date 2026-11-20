import { describe, expect, it } from 'vitest';
import { getActivityTitle } from './getActivityTitle';

const createContent = (status: string) => [
    {
        toolName: 'createContent' as const,
        keyId: 'create-1',
        calls: [
            {
                toolCallId: 'create-1',
                toolName: 'createContent',
                toolArgs: {},
                isPreliminary: false,
                toolOutput: { result: 'out', metadata: { status } },
            },
        ],
    },
];

describe('getActivityTitle', () => {
    it('claims content was created only when the save succeeded', () => {
        expect(getActivityTitle(createContent('success')).title).toBe(
            'How this content was created',
        );
        for (const status of ['rejected', 'timeout', 'error']) {
            expect(getActivityTitle(createContent(status)).title).toBe(
                'Steps taken',
            );
        }
    });
});
