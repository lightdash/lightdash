import { SchedulerJobStatus } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExportToGoogleSheet } from './useExportToGoogleSheet';

const mocks = vi.hoisted(() => ({
    getCsvFileUrl: vi.fn(),
    showToastInfo: vi.fn(),
    showToastSuccess: vi.fn(),
    showToastError: vi.fn(),
    showToastApiError: vi.fn(),
}));
vi.mock('../../../api/csv', () => ({ getCsvFileUrl: mocks.getCsvFileUrl }));
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastInfo: mocks.showToastInfo,
        showToastSuccess: mocks.showToastSuccess,
        showToastError: mocks.showToastError,
        showToastApiError: mocks.showToastApiError,
    }),
}));
vi.mock('../../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => vi.fn(),
}));

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/abc';
const started = {
    status: SchedulerJobStatus.STARTED,
    truncated: false,
    progress: null,
};
const completed = {
    url: SHEET_URL,
    status: SchedulerJobStatus.COMPLETED,
    truncated: false,
    progress: null,
};
const getGsheetLink = () => Promise.resolve({ jobId: 'job-1' });

const createWrapper = () => {
    const queryClient = new QueryClient();
    const Wrapper: FC<PropsWithChildren> = ({ children }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
    return Wrapper;
};

describe('useExportToGoogleSheet', () => {
    let open: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers();
        open = vi.spyOn(window, 'open').mockReturnValue(null);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        Object.values(mocks).forEach((mock) => mock.mockReset());
    });

    it('finishes the export after the component that started it unmounts', async () => {
        mocks.getCsvFileUrl
            .mockResolvedValueOnce(started)
            .mockResolvedValueOnce(started)
            .mockResolvedValue(completed);
        const { result, unmount } = renderHook(
            () => useExportToGoogleSheet({ getGsheetLink }),
            { wrapper: createWrapper() },
        );

        act(() => result.current.startExporting());
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(result.current.isExporting).toBe(true);

        // The menu hosting the export button closes
        unmount();
        await vi.advanceTimersByTimeAsync(4000);

        expect(mocks.getCsvFileUrl).toHaveBeenCalledTimes(3);
        expect(open).toHaveBeenCalledWith(
            SHEET_URL,
            '_blank',
            'noopener,noreferrer',
        );
        expect(mocks.showToastSuccess).toHaveBeenCalledTimes(1);
        const toast = mocks.showToastSuccess.mock.calls[0][0];
        expect(toast).toMatchObject({
            key: 'exporting-gsheets',
            autoClose: false,
        });

        // The toast keeps a link for when the browser blocks the new tab
        open.mockClear();
        toast.action.onClick();
        expect(open).toHaveBeenCalledWith(
            SHEET_URL,
            '_blank',
            'noopener,noreferrer',
        );
    });

    it('shows a remounted button as exporting until the job is done', async () => {
        mocks.getCsvFileUrl
            .mockResolvedValueOnce(started)
            .mockResolvedValue(completed);
        const wrapper = createWrapper();
        const first = renderHook(
            () => useExportToGoogleSheet({ getGsheetLink }),
            { wrapper },
        );
        act(() => first.result.current.startExporting());
        await act(() => vi.advanceTimersByTimeAsync(0));
        first.unmount();

        const second = renderHook(
            () => useExportToGoogleSheet({ getGsheetLink }),
            { wrapper },
        );
        expect(second.result.current.isExporting).toBe(true);

        // React Query notifies observers on a zero-delay timer
        await act(() => vi.advanceTimersByTimeAsync(2001));
        expect(second.result.current.isExporting).toBe(false);
    });

    it('replaces the loading toast with an error when the job fails', async () => {
        const apiError = {
            status: 'error',
            error: {
                name: 'NotFoundError',
                statusCode: 404,
                message: 'This export could not be completed.',
                data: {},
            },
        };
        mocks.getCsvFileUrl.mockRejectedValue(apiError);
        const { result } = renderHook(
            () => useExportToGoogleSheet({ getGsheetLink }),
            { wrapper: createWrapper() },
        );

        act(() => result.current.startExporting());
        await act(() => vi.advanceTimersByTimeAsync(10000));

        expect(mocks.getCsvFileUrl).toHaveBeenCalledTimes(5);
        expect(mocks.showToastApiError).toHaveBeenCalledWith({
            title: 'Unable to export to Google Sheets',
            key: 'exporting-gsheets',
            apiError: apiError.error,
        });
        expect(mocks.showToastSuccess).not.toHaveBeenCalled();
        expect(open).not.toHaveBeenCalled();
        expect(result.current.isExporting).toBe(false);
    });
});
