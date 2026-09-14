import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import {
    APP_PREVIEW_TOKEN_REFRESH_INTERVAL_MS,
    APP_PREVIEW_TOKEN_RETRY_INTERVAL_MS,
    getPreviewTokenRefetchInterval,
    getVisiblePreviewTokenError,
} from './previewTokenQueryOptions';
import { useAppPreviewToken } from './useAppPreviewToken';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));

const mockedLightdashApi = vi.mocked(lightdashApi);

describe('useAppPreviewToken', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockedLightdashApi.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('renews the signed capability before it expires', async () => {
        mockedLightdashApi
            .mockResolvedValueOnce({ token: 'token-1' })
            .mockResolvedValueOnce({ token: 'token-2' });
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const wrapper = ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
        const { result } = renderHook(
            () => useAppPreviewToken('project-1', 'app-1', 2),
            { wrapper },
        );

        await vi.waitFor(() => expect(result.current.data).toBe('token-1'));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(
                APP_PREVIEW_TOKEN_REFRESH_INTERVAL_MS,
            );
        });
        await vi.waitFor(() => expect(result.current.data).toBe('token-2'));
        expect(mockedLightdashApi).toHaveBeenCalledTimes(2);
    });

    it('keeps cached data and retries a failed renewal promptly', async () => {
        mockedLightdashApi
            .mockResolvedValueOnce({ token: 'token-1' })
            .mockRejectedValueOnce(new Error('temporary mint failure'))
            .mockResolvedValueOnce({ token: 'token-2' });
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const wrapper = ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
        const { result } = renderHook(
            () => useAppPreviewToken('project-1', 'app-1', 2),
            { wrapper },
        );

        await vi.waitFor(() => expect(result.current.data).toBe('token-1'));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(
                APP_PREVIEW_TOKEN_REFRESH_INTERVAL_MS,
            );
        });
        await vi.waitFor(() =>
            expect(mockedLightdashApi).toHaveBeenCalledTimes(2),
        );
        expect(result.current.data).toBe('token-1');

        await act(async () => {
            await vi.advanceTimersByTimeAsync(
                APP_PREVIEW_TOKEN_RETRY_INTERVAL_MS,
            );
        });
        await vi.waitFor(() => expect(result.current.data).toBe('token-2'));
        expect(mockedLightdashApi).toHaveBeenCalledTimes(3);
    });

    it.each([403, 404])(
        'surfaces cached-token HTTP %s errors and stops interval retries',
        (statusCode) => {
            const error = {
                status: 'error' as const,
                error: {
                    name: 'ApiError',
                    statusCode,
                    message: 'Request failed',
                    data: {},
                },
            };

            expect(getVisiblePreviewTokenError(error, true)).toBe(error);
            expect(getPreviewTokenRefetchInterval(error)).toBe(false);
        },
    );
});
