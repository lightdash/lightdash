import { describe, expect, it } from 'vitest';
import { isThreadReadOnly } from './threadReadOnly';

const own = { createdFrom: 'web_app', user: { uuid: 'me' } };

describe('isThreadReadOnly', () => {
    it('is not read-only while the thread is still loading', () => {
        expect(isThreadReadOnly(undefined, 'me')).toBe(false);
        expect(isThreadReadOnly(own, undefined)).toBe(false);
    });

    it('lets people reply to their own web threads', () => {
        expect(isThreadReadOnly(own, 'me')).toBe(false);
    });

    it('is read-only for Slack threads', () => {
        expect(isThreadReadOnly({ ...own, createdFrom: 'slack' }, 'me')).toBe(
            true,
        );
    });

    it("is read-only for someone else's thread", () => {
        expect(isThreadReadOnly(own, 'someone-else')).toBe(true);
    });
});
