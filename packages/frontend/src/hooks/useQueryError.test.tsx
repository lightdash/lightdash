import { type ApiError } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { vi } from 'vitest';
import useQueryError from './useQueryError';

const mocks = vi.hoisted(() => ({ addToastError: vi.fn() }));

vi.mock('./toaster/useToaster', () => ({
    default: () => ({
        addToastError: mocks.addToastError,
        showToastError: vi.fn(),
    }),
}));

const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={new QueryClient()}>
        {children}
    </QueryClientProvider>
);

const queryFailed: ApiError = {
    status: 'error',
    error: {
        name: 'Error',
        statusCode: 500,
        message: 'run() raised: Traceback ...',
        data: {},
    },
};

describe('useQueryError', () => {
    beforeEach(() => vi.clearAllMocks());

    it('toasts a failed query', async () => {
        const { result } = renderHook(() => useQueryError(), { wrapper });
        await act(async () => result.current(queryFailed));
        expect(mocks.addToastError).toHaveBeenCalledTimes(1);
    });

    it('does not toast when the caller shows the error itself', async () => {
        const { result } = renderHook(
            () => useQueryError({ toastErrors: false }),
            { wrapper },
        );
        await act(async () => result.current(queryFailed));
        expect(mocks.addToastError).not.toHaveBeenCalled();
    });
});
