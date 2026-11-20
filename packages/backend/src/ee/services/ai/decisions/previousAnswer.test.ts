import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { getPreviousAnswer } from './previousAnswer';

const askUserCall: ModelMessage = {
    role: 'assistant',
    content: [
        {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'askUser',
            input: { questions: [] },
        },
    ],
};

describe('getPreviousAnswer', () => {
    it('is null before the agent has replied', () => {
        expect(getPreviousAnswer([{ role: 'user', content: 'hi' }])).toBeNull();
    });

    it('keeps the end of the last reply, where offers sit', () => {
        const reply = `${'x'.repeat(2_000)} Want me to pull the ARR lost to downgrades?`;
        const previous = getPreviousAnswer([
            { role: 'user', content: 'downgrade rate?' },
            { role: 'assistant', content: reply },
            { role: 'user', content: 'yes' },
        ]);
        expect(previous?.text).toHaveLength(1_200);
        expect(previous?.text).toMatch(/Want me to pull the ARR lost/);
        expect(previous?.askedUser).toBe(false);
    });

    it('knows when the last reply asked through askUser', () => {
        expect(
            getPreviousAnswer([
                { role: 'user', content: 'revenue by region' },
                askUserCall,
                { role: 'assistant', content: 'Should I include refunds?' },
                { role: 'user', content: 'Yes' },
            ])?.askedUser,
        ).toBe(true);
    });

    it('ignores askUser calls from earlier turns', () => {
        expect(
            getPreviousAnswer([
                { role: 'user', content: 'revenue by region' },
                askUserCall,
                { role: 'assistant', content: 'Should I include refunds?' },
                { role: 'user', content: 'Yes' },
                { role: 'assistant', content: 'Here it is, refunds included.' },
                { role: 'user', content: 'thanks!' },
            ])?.askedUser,
        ).toBe(false);
    });
});
