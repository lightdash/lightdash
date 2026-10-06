import { NavigationType } from 'react-router';
import { describe, expect, it } from 'vitest';
import { isWalkthroughLeavingCopy, LEAVING_COPY_STATE } from './trainingCopy';

describe('isWalkthroughLeavingCopy', () => {
    const leaving = { state: LEAVING_COPY_STATE };

    it("lets the walkthrough's own navigation out of the copy through", () => {
        expect(
            isWalkthroughLeavingCopy({
                nextLocation: leaving,
                historyAction: NavigationType.Push,
            }),
        ).toBe(true);
        expect(
            isWalkthroughLeavingCopy({
                nextLocation: leaving,
                historyAction: NavigationType.Replace,
            }),
        ).toBe(true);
    });

    it('still asks on Back or Forward to an entry that kept the flag', () => {
        expect(
            isWalkthroughLeavingCopy({
                nextLocation: leaving,
                historyAction: NavigationType.Pop,
            }),
        ).toBe(false);
    });

    it('still asks on any other navigation', () => {
        expect(
            isWalkthroughLeavingCopy({
                nextLocation: { state: null },
                historyAction: NavigationType.Push,
            }),
        ).toBe(false);
    });
});
