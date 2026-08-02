import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import ChunkErrorRouteBoundary from './ChunkErrorRouteBoundary';

const mockUseRouteError = vi.fn();
const mockIsChunkLoadErrorObject = vi.fn();
const mockHasRecentChunkReload = vi.fn();
const mockTriggerChunkErrorReload = vi.fn();
const mockCaptureException = vi.fn((_error: unknown) => 'event-123');

vi.mock('react-router', () => ({
    useRouteError: () => mockUseRouteError(),
}));

vi.mock('../chunkErrorHandler', () => ({
    isChunkLoadErrorObject: (e: unknown) => mockIsChunkLoadErrorObject(e),
    hasRecentChunkReload: () => mockHasRecentChunkReload(),
    triggerChunkErrorReload: () => mockTriggerChunkErrorReload(),
}));

vi.mock('@sentry/react', () => ({
    captureException: (e: unknown) => mockCaptureException(e),
}));

vi.mock('./ErrorFallbacks', () => ({
    ChunkErrorFallback: () => <div>chunk-fallback</div>,
    GeneralErrorFallback: ({ eventId }: { eventId: string }) => (
        <div>general-fallback:{eventId}</div>
    ),
}));

describe('ChunkErrorRouteBoundary', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('auto-reloads once on a chunk error with no recent reload', () => {
        mockUseRouteError.mockReturnValue(new Error('Failed to fetch'));
        mockIsChunkLoadErrorObject.mockReturnValue(true);
        mockHasRecentChunkReload.mockReturnValue(false);

        renderWithProviders(<ChunkErrorRouteBoundary />);

        expect(mockTriggerChunkErrorReload).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('chunk-fallback')).not.toBeInTheDocument();
    });

    it('shows the chunk fallback when a reload was already attempted', () => {
        mockUseRouteError.mockReturnValue(new Error('Failed to fetch'));
        mockIsChunkLoadErrorObject.mockReturnValue(true);
        mockHasRecentChunkReload.mockReturnValue(true);

        renderWithProviders(<ChunkErrorRouteBoundary />);

        expect(mockTriggerChunkErrorReload).not.toHaveBeenCalled();
        expect(screen.getByText('chunk-fallback')).toBeInTheDocument();
    });

    it('captures non-chunk errors to Sentry and shows the general fallback', () => {
        mockUseRouteError.mockReturnValue(new Error('boom'));
        mockIsChunkLoadErrorObject.mockReturnValue(false);

        renderWithProviders(<ChunkErrorRouteBoundary />);

        expect(mockCaptureException).toHaveBeenCalledTimes(1);
        expect(mockTriggerChunkErrorReload).not.toHaveBeenCalled();
        expect(
            screen.getByText('general-fallback:event-123'),
        ).toBeInTheDocument();
    });
});
