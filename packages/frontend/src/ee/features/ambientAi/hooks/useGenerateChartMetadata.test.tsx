import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren, useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedLightdashApi } from '../../../../api';
import { explore } from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig.mock';
import { mockedLightdashApi } from '../../../../testing/mockedLightdashApi';
import { mockSavedChartResponse } from '../../../../testing/savedChartResponse.mock';
import { useAmbientAiEnabled } from './useAmbientAiEnabled';
import {
    useGenerateChartMetadata,
    type ChartMetadata,
} from './useGenerateChartMetadata';

vi.mock('../../../../api');
vi.mock('./useAmbientAiEnabled', () => ({
    useAmbientAiEnabled: vi.fn(),
}));

const chart = mockSavedChartResponse();
const setup = (onComplete?: (metadata: ChartMetadata | null) => void) => {
    const client = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(
        () => {
            const metadata = useGenerateChartMetadata({
                projectUuid: 'chart-project',
                unsavedChartVersion: chart,
                explore,
                onComplete,
            });
            const { trigger } = metadata;
            useEffect(() => {
                trigger();
            }, [trigger]);
            return metadata;
        },
        { wrapper },
    );
};

describe('useGenerateChartMetadata', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedLightdashApi.mockResolvedValue({
            title: 'Revenue',
            description: 'Revenue by method',
        });
    });

    it('does not send a mount-time or manual request while access is disabled', () => {
        vi.mocked(useAmbientAiEnabled).mockReturnValue(false);
        const { result } = setup();
        act(() => result.current.trigger());
        expect(useAmbientAiEnabled).toHaveBeenCalledWith('chart-project');
        expect(sharedLightdashApi).not.toHaveBeenCalled();
    });

    it('can generate for the same chart after access is enabled', async () => {
        vi.mocked(useAmbientAiEnabled).mockReturnValue(false);
        const { result, rerender } = setup();
        expect(sharedLightdashApi).not.toHaveBeenCalled();
        vi.mocked(useAmbientAiEnabled).mockReturnValue(true);
        rerender();
        await waitFor(() =>
            expect(result.current.generatedMetadata?.name).toBe('Revenue'),
        );
        expect(sharedLightdashApi).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                url: '/ai/chart-project/chart/generate-metadata',
                method: 'POST',
            }),
        );
    });
});

it('continues without metadata when generation fails', async () => {
    vi.mocked(useAmbientAiEnabled).mockReturnValue(true);
    mockedLightdashApi.mockRejectedValue(new Error('Generation unavailable'));
    const onComplete = vi.fn();
    const { result } = setup(onComplete);
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(null));
    expect(result.current.generatedMetadata).toBe(null);
});
it('keeps the six-second abort and fallback', async () => {
    vi.useFakeTimers();
    try {
        vi.mocked(useAmbientAiEnabled).mockReturnValue(true);
        let signal: AbortSignal;
        mockedLightdashApi.mockImplementation(
            (request) =>
                new Promise((_resolve, reject) => {
                    signal = request.signal;
                    signal.addEventListener('abort', () =>
                        reject(new Error('Aborted')),
                    );
                }),
        );
        const onComplete = vi.fn();
        const view = setup(onComplete);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5999);
        });
        expect(signal!.aborted).toBe(false);
        expect(onComplete).not.toHaveBeenCalled();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(signal!.aborted).toBe(true);
        expect(onComplete).toHaveBeenCalledWith(null);
        view.unmount();
    } finally {
        vi.useRealTimers();
    }
});
