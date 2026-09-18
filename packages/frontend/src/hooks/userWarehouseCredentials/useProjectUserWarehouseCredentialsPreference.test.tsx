import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('../toaster/useToaster', () => ({
    default: () => ({
        showToastApiError: vi.fn(),
        showToastSuccess: vi.fn(),
    }),
}));

import { lightdashApi } from '../../api';
import {
    useProjectUserWarehouseCredentialsPreference,
    useProjectUserWarehouseCredentialsPreferenceMutation,
} from './useProjectUserWarehouseCredentialsPreference';

const mockApi = lightdashApi as unknown as Mock;

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return function Wrapper({ children }: PropsWithChildren) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    };
};

describe('useProjectUserWarehouseCredentialsPreference', () => {
    beforeEach(() => {
        mockApi.mockReset();
    });

    it('treats an undefined preference as a successful state', async () => {
        mockApi.mockResolvedValue(null);
        const { result } = renderHook(
            () =>
                useProjectUserWarehouseCredentialsPreference(
                    'project-uuid',
                    'connection-uuid',
                ),
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(result.current.data).toBeUndefined();
        expect(result.current.isError).toBe(false);
        expect(mockApi).toHaveBeenCalledWith({
            url: '/projects/project-uuid/user-credentials?connectionUuid=connection-uuid',
            method: 'GET',
            body: undefined,
        });
    });

    it('does not request an unscoped preference', () => {
        const { result } = renderHook(
            () =>
                useProjectUserWarehouseCredentialsPreference(
                    'project-uuid',
                    undefined,
                ),
            { wrapper: createWrapper() },
        );

        expect(result.current.fetchStatus).toBe('idle');
        expect(result.current.data).toBeUndefined();
        expect(mockApi).not.toHaveBeenCalled();
    });

    it('updates the preference for the selected connection', async () => {
        mockApi.mockResolvedValue(null);
        const { result } = renderHook(
            () => useProjectUserWarehouseCredentialsPreferenceMutation(),
            { wrapper: createWrapper() },
        );

        result.current.mutate({
            projectUuid: 'project-uuid',
            userWarehouseCredentialsUuid: 'credentials-uuid',
            connectionUuid: 'connection-uuid',
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(mockApi).toHaveBeenCalledWith({
            url: '/projects/project-uuid/user-credentials/credentials-uuid?connectionUuid=connection-uuid',
            method: 'PATCH',
            body: undefined,
        });
    });
});
