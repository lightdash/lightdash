import { getAppVersionFailureMessage } from './getAppVersionFailureMessage';

describe('getAppVersionFailureMessage', () => {
    it('prefers the user-facing status message over technical details', () => {
        expect(
            getAppVersionFailureMessage({
                statusMessage:
                    'Failed to load your data models. Please try again.',
                error: 'TypeError: s.replace is not a function',
            }),
        ).toBe('Failed to load your data models. Please try again.');
    });

    it('falls back to the technical error for older versions', () => {
        expect(
            getAppVersionFailureMessage({
                statusMessage: null,
                error: 'Build failed with exit code 1',
            }),
        ).toBe('Build failed with exit code 1');
    });

    it('uses a generic message when no failure details are available', () => {
        expect(
            getAppVersionFailureMessage({ statusMessage: null, error: null }),
        ).toBe('Generation failed. Please try again.');
    });
});
