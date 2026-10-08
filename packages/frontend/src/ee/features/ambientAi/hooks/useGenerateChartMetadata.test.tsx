import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren, useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../../api';
import { useAiAccessGate } from '../../../../features/aiAccess/useAiAccessGate';
import { explore } from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig.mock';
import { mockSavedChartResponse } from '../../../../testing/savedChartResponse.mock';
import { useGenerateChartMetadata } from './useGenerateChartMetadata';

vi.mock('../../../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../../../features/aiAccess/useAiAccessGate', () => ({
    useAiAccessGate: vi.fn(),
}));

const chart = mockSavedChartResponse();
const setup = () => {
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
        vi.mocked(lightdashApi).mockResolvedValue({
            title: 'Revenue',
            description: 'Revenue by method',
        });
    });

    it('does not send a mount-time or manual request while access is disabled', () => {
        vi.mocked(useAiAccessGate).mockReturnValue({
            disabled: true,
            isLoading: true,
            isError: false,
            refusal: undefined,
            refetch: vi.fn(),
        });
        const { result } = setup();
        act(() => result.current.trigger());
        expect(useAiAccessGate).toHaveBeenCalledWith('chart-project');
        expect(lightdashApi).not.toHaveBeenCalled();
    });

    it('can generate for the same chart after access is enabled', async () => {
        vi.mocked(useAiAccessGate).mockReturnValue({
            disabled: true,
            isLoading: true,
            isError: false,
            refusal: undefined,
            refetch: vi.fn(),
        });
        const { result, rerender } = setup();
        expect(lightdashApi).not.toHaveBeenCalled();
        vi.mocked(useAiAccessGate).mockReturnValue({
            disabled: false,
            isLoading: false,
            isError: false,
            refusal: undefined,
            refetch: vi.fn(),
        });
        rerender();
        await waitFor(() =>
            expect(result.current.generatedMetadata?.name).toBe('Revenue'),
        );
        expect(lightdashApi).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                url: '/ai/chart-project/chart/generate-metadata',
                method: 'POST',
            }),
        );
    });
});
