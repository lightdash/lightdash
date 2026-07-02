import { render, screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import {
    afterAll,
    afterEach,
    beforeAll,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import ErrorBoundary from './ErrorBoundary';

const mockIsChunkLoadErrorObject = vi.fn();
const mockCaptureException = vi.fn((_error: unknown) => 'event-123');

// Drive the fallback directly with a controlled error, bypassing the need for a
// child that actually throws.
let boundaryError: unknown = null;

vi.mock('../chunkErrorHandler', () => ({
    isChunkLoadErrorObject: (e: unknown) => mockIsChunkLoadErrorObject(e),
}));

vi.mock('@sentry/react', () => ({
    ErrorBoundary: ({
        fallback,
    }: {
        fallback: (props: { eventId: string; error: unknown }) => ReactElement;
        children: unknown;
    }) => fallback({ eventId: 'event-123', error: boundaryError }),
    captureException: (e: unknown) => mockCaptureException(e),
}));

vi.mock('./ErrorFallbacks', () => ({
    ChunkErrorFallback: () => <div>chunk-fallback</div>,
    GeneralErrorFallback: ({ eventId }: { eventId: string }) => (
        <div>general-fallback:{eventId}</div>
    ),
}));

describe('ErrorBoundary', () => {
    const reloadSpy = vi.fn();
    const originalLocation = window.location;

    beforeAll(() => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { href: 'http://localhost/', reload: reloadSpy },
        });
    });

    afterAll(() => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: originalLocation,
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
        boundaryError = null;
    });

    it('shows the chunk fallback and never reloads on a chunk error', () => {
        boundaryError = new Error('Failed to fetch');
        mockIsChunkLoadErrorObject.mockReturnValue(true);

        render(
            <ErrorBoundary>
                <div>child</div>
            </ErrorBoundary>,
        );

        expect(screen.getByText('chunk-fallback')).toBeInTheDocument();
        expect(reloadSpy).not.toHaveBeenCalled();
    });

    it('shows the general fallback on a non-chunk error', () => {
        boundaryError = new Error('boom');
        mockIsChunkLoadErrorObject.mockReturnValue(false);

        render(
            <ErrorBoundary>
                <div>child</div>
            </ErrorBoundary>,
        );

        expect(
            screen.getByText('general-fallback:event-123'),
        ).toBeInTheDocument();
        expect(reloadSpy).not.toHaveBeenCalled();
    });
});
