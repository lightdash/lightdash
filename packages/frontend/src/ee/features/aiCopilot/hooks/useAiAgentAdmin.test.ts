import { describe, expect, it } from 'vitest';
import { getReviewItemWritebackSuccessToast } from './useAiAgentAdmin';

describe('getReviewItemWritebackSuccessToast', () => {
    it('shows queued copy when the async writeback request has no PR yet', () => {
        const toast = getReviewItemWritebackSuccessToast({
            linkedPrUrl: null,
            prWritebackMessage: 'Queued',
            prWritebackStatus: 'queued',
        });

        expect(toast.title).toBe('Writeback queued');
        expect(toast.subtitle).toBe('The review item will update as it runs.');
        expect(toast.title).not.toContain('changes');
    });

    it('shows PR copy when the response includes a PR URL', () => {
        expect(
            getReviewItemWritebackSuccessToast({
                linkedPrUrl: 'https://github.com/acme/analytics/pull/42',
                prWritebackMessage: 'Opened pull request',
                prWritebackStatus: 'completed',
            }),
        ).toEqual({ title: 'Pull request opened' });
    });

    it('prefers queued copy over a stale PR URL while writeback is in progress', () => {
        expect(
            getReviewItemWritebackSuccessToast({
                linkedPrUrl: 'https://github.com/acme/analytics/pull/41',
                prWritebackMessage: 'Queued',
                prWritebackStatus: 'queued',
            }),
        ).toEqual({
            title: 'Writeback queued',
            subtitle: 'The review item will update as it runs.',
        });
    });

    it('uses terminal copy for a completed no-PR writeback', () => {
        expect(
            getReviewItemWritebackSuccessToast({
                linkedPrUrl: null,
                prWritebackMessage: 'Writeback ran - no changes were needed',
                prWritebackStatus: 'completed',
            }),
        ).toEqual({
            title: 'Writeback completed',
            subtitle: 'Writeback ran - no changes were needed',
        });
    });
});
