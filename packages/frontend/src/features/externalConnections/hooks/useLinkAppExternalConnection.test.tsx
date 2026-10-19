import { type AppExternalConnectionLinked } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedLightdashApi } from '../../../api';
import { mockedLightdashApi } from '../../../testing/mockedLightdashApi';
import { useLinkAppExternalConnection } from './useLinkAppExternalConnection';

vi.mock('../../../api');
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: vi.fn(),
        showToastApiError: vi.fn(),
    }),
}));

const setup = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    const wrapper: FC<PropsWithChildren> = ({ children }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );

    return renderHook(() => useLinkAppExternalConnection(), { wrapper });
};

describe('useLinkAppExternalConnection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('generates a unique alias from the app links before linking', async () => {
        mockedLightdashApi
            .mockResolvedValueOnce([
                { alias: 'example_api' },
            ] as AppExternalConnectionLinked[])
            .mockResolvedValueOnce(undefined as never);
        const { result } = setup();

        result.current.mutate({
            projectUuid: 'project-1',
            appUuid: 'app-1',
            appName: 'Revenue dashboard',
            externalConnectionUuid: 'connection-1',
            connectionName: 'Example API',
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(sharedLightdashApi).toHaveBeenNthCalledWith(1, {
            url: '/ee/projects/project-1/apps/app-1/external-connections',
            method: 'GET',
            body: undefined,
        });
        expect(sharedLightdashApi).toHaveBeenNthCalledWith(2, {
            url: '/ee/projects/project-1/apps/app-1/external-connections',
            method: 'POST',
            body: JSON.stringify({
                externalConnectionUuid: 'connection-1',
                alias: 'example_api_2',
            }),
        });
    });
});
