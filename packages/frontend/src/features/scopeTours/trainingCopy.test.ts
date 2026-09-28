import { describe, expect, it } from 'vitest';
import { isDocsModule, tourUrlInCopy } from './trainingCopy';

describe('tourUrlInCopy', () => {
    it('opens scope walkthroughs on the homepage of the copy', () => {
        expect(tourUrlInCopy('copy-1', 'manage:PinnedItems', 'learn')).toBe(
            '/projects/copy-1/home?tour=manage%3APinnedItems&copy=1&from=learn',
        );
    });

    it('opens docs lessons on the workspace page of the copy', () => {
        expect(isDocsModule('docs:semantic-layer/metrics')).toBe(true);
        expect(
            tourUrlInCopy('copy-1', 'docs:semantic-layer/metrics', 'home'),
        ).toBe(
            '/projects/copy-1/learn/workspace?tour=docs%3Asemantic-layer%2Fmetrics&copy=1',
        );
    });
});
