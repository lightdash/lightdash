import { describe, expect, it, vi } from 'vitest';
import { opensInWorkspace, tourUrlInCopy } from './trainingCopy';

vi.mock('../learn/codeLessons', () => ({
    hasCodeLesson: (scope: string) => scope === 'view:ContentAsCode',
}));

describe('tourUrlInCopy', () => {
    it('opens scope walkthroughs on the homepage of the copy', () => {
        expect(tourUrlInCopy('copy-1', 'manage:PinnedItems', 'learn')).toBe(
            '/projects/copy-1/home?tour=manage%3APinnedItems&copy=1&from=learn',
        );
    });

    it('opens docs lessons on the workspace page of the copy', () => {
        expect(opensInWorkspace('docs:semantic-layer/metrics')).toBe(true);
        expect(
            tourUrlInCopy('copy-1', 'docs:semantic-layer/metrics', 'home'),
        ).toBe(
            '/projects/copy-1/learn/workspace?tour=docs%3Asemantic-layer%2Fmetrics&copy=1',
        );
    });

    it('opens a content-as-code lesson on the workspace page of the copy', () => {
        expect(opensInWorkspace('view:ContentAsCode')).toBe(true);
        expect(opensInWorkspace('manage:ContentAsCode')).toBe(false);
        expect(tourUrlInCopy('copy-1', 'view:ContentAsCode', 'learn')).toBe(
            '/projects/copy-1/learn/workspace?tour=view%3AContentAsCode&copy=1&from=learn',
        );
    });
});
