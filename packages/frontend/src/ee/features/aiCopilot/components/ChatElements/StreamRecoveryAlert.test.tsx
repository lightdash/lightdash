import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { StreamRecoveryAlert } from './StreamRecoveryAlert';

describe('StreamRecoveryAlert', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('offers a page refresh when recovery takes too long', async () => {
        vi.useFakeTimers();
        renderWithProviders(<StreamRecoveryAlert />);

        expect(screen.queryByRole('button')).not.toBeInTheDocument();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });

        expect(screen.getByRole('button')).toBeVisible();
    });
});
