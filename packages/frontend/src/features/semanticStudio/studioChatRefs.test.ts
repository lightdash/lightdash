import { describe, expect, it } from 'vitest';
import { splitStudioChatCode, withStudioChatCode } from './studioChatRefs';

const picked = {
    path: 'models/orders.yml',
    from: 4,
    to: 6,
    text: '  - name: status\n    description: x',
};

describe('studio chat code', () => {
    it('splits the question from the picked lines it was sent with', () => {
        const sent = withStudioChatCode('Rename status', [
            picked,
            { ...picked, path: 'models/orders.sql', from: 1, to: 1 },
        ]);
        expect(sent.startsWith('Rename status\n')).toBe(true);
        expect(splitStudioChatCode(sent)).toEqual({
            text: 'Rename status',
            code: [
                { path: 'models/orders.yml', from: 4, to: 6 },
                { path: 'models/orders.sql', from: 1, to: 1 },
            ],
        });
    });

    it('keeps code only messages and plain messages', () => {
        expect(splitStudioChatCode(withStudioChatCode('', [picked]))).toEqual({
            text: '',
            code: [{ path: 'models/orders.yml', from: 4, to: 6 }],
        });
        expect(splitStudioChatCode('What is Selected code: here?')).toEqual({
            text: 'What is Selected code: here?',
            code: [],
        });
    });
});
