import { render, screen } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Mantine8Provider from '../../providers/Mantine8Provider';
import MantineProvider from '../../providers/MantineProvider';
import ChunkErrorRouteBoundary from './ChunkErrorRouteBoundary';

// ChunkErrorRouteBoundary renders a Mantine 8 <Flex>, which needs both the v6
// and v8 providers (the v8 provider reads color scheme from the v6 one).
const Wrapper: FC<PropsWithChildren> = ({ children }) => (
    <MantineProvider>
        <Mantine8Provider>{children}</Mantine8Provider>
    </MantineProvider>
);

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

        // This path auto-reloads and renders nothing (no Mantine tree), so it
        // needs no provider wrapper — asserting an empty container.
        const { container } = render(<ChunkErrorRouteBoundary />);

        expect(mockTriggerChunkErrorReload).toHaveBeenCalledTimes(1);
        expect(container.firstChild).toBeNull();
    });

    it('shows the chunk fallback when a reload was already attempted', () => {
        mockUseRouteError.mockReturnValue(new Error('Failed to fetch'));
        mockIsChunkLoadErrorObject.mockReturnValue(true);
        mockHasRecentChunkReload.mockReturnValue(true);

        render(<ChunkErrorRouteBoundary />, { wrapper: Wrapper });

        expect(mockTriggerChunkErrorReload).not.toHaveBeenCalled();
        expect(screen.getByText('chunk-fallback')).toBeInTheDocument();
    });

    it('captures non-chunk errors to Sentry and shows the general fallback', () => {
        mockUseRouteError.mockReturnValue(new Error('boom'));
        mockIsChunkLoadErrorObject.mockReturnValue(false);

        render(<ChunkErrorRouteBoundary />, { wrapper: Wrapper });

        expect(mockCaptureException).toHaveBeenCalledTimes(1);
        expect(mockTriggerChunkErrorReload).not.toHaveBeenCalled();
        expect(
            screen.getByText('general-fallback:event-123'),
        ).toBeInTheDocument();
    });
});
