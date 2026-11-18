import { describe, expect, it } from 'vitest';
import { buildCarryOver } from './carryOver';

const messages = [
    { role: 'user' as const, message: 'first question' },
    { role: 'assistant' as const, message: 'first answer' },
    { role: 'user' as const, message: 'second question' },
    { role: 'assistant' as const, message: 'second answer' },
];

describe('buildCarryOver', () => {
    it('hands over the earlier exchange word for word, newest first', () => {
        expect(buildCarryOver(messages, 10_000)).toBe(
            [
                'This conversation continues an earlier one that ran out of room for screenshots. The earlier exchange, newest first:',
                '',
                'Agent: second answer',
                '',
                'User: second question',
                '',
                'Agent: first answer',
                '',
                'User: first question',
            ].join('\n'),
        );
    });

    it('drops the oldest turns to fit the limit', () => {
        const text = buildCarryOver(messages, 200);
        expect(text.length).toBeLessThanOrEqual(200);
        expect(text).toContain('Agent: second answer');
        expect(text).not.toContain('first question');
    });

    it('cuts a single turn that is too long on its own', () => {
        const text = buildCarryOver(
            [{ role: 'assistant' as const, message: 'x'.repeat(500) }],
            200,
        );
        expect(text.length).toBeLessThanOrEqual(200);
        expect(text).toContain('Agent: xxx');
    });

    it('skips empty messages', () => {
        expect(
            buildCarryOver(
                [{ role: 'assistant' as const, message: '  ' }],
                500,
            ),
        ).toBe('');
    });
});
