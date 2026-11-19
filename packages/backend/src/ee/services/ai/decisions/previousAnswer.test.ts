import { describe, expect, it } from 'vitest';
import { getPreviousAnswer } from './previousAnswer';

const reply = (
    response: string | null,
    errorMessage: string | null = null,
) => ({
    response,
    errorMessage,
    askedUser: false,
});

describe('getPreviousAnswer', () => {
    it('is null before the agent has replied', () => {
        expect(getPreviousAnswer(null)).toBeNull();
    });

    it('keeps the end of the last reply, where offers sit', () => {
        const previous = getPreviousAnswer(
            reply(
                `${'x'.repeat(2_000)} Want me to pull the ARR lost to downgrades?`,
            ),
        );
        expect(previous?.text).toHaveLength(1_200);
        expect(previous?.text).toMatch(/Want me to pull the ARR lost/);
    });

    it('gives nothing for a failed or interrupted turn instead of an older reply', () => {
        expect(getPreviousAnswer(reply(null, 'Model timed out'))).toBeNull();
        expect(getPreviousAnswer(reply(''))).toBeNull();
    });

    it('carries whether the last reply asked through askUser', () => {
        expect(
            getPreviousAnswer({
                response: 'Should I include refunds?',
                errorMessage: null,
                askedUser: true,
            })?.askedUser,
        ).toBe(true);
    });
});
