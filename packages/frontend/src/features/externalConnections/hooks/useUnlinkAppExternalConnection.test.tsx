import { type AppExternalConnectionLinked } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { useUnlinkAppExternalConnection } from './useUnlinkAppExternalConnection';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastInfo: vi.fn(), showToastApiError: vi.fn() }),
}));

const queryKey = ['app-external-connections', 'project-1', 'app-1'];
const links = [
    { alias: 'weather', connection: { externalConnectionUuid: 'c-weather' } },
    { alias: 'images', connection: { externalConnectionUuid: 'c-images' } },
] as unknown as AppExternalConnectionLinked[];

const setup = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    queryClient.setQueryData(queryKey, links);
    const wrapper: FC<PropsWithChildren> = ({ children }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
    const { result } = renderHook(() => useUnlinkAppExternalConnection(), {
        wrapper,
    });
    return { queryClient, result };
};

describe('useUnlinkAppExternalConnection', () => {
    it('DELETEs by alias and drops the link from the cache', async () => {
        vi.mocked(lightdashApi).mockResolvedValue(undefined as never);
        const { queryClient, result } = setup();

        result.current.mutate({
            projectUuid: 'project-1',
            appUuid: 'app-1',
            alias: 'weather',
            name: 'Weather',
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(lightdashApi).toHaveBeenCalledWith({
            url: '/ee/projects/project-1/apps/app-1/external-connections/weather',
            method: 'DELETE',
            body: undefined,
        });
        expect(queryClient.getQueryData(queryKey)).toEqual([links[1]]);
    });

    it('restores the link when the request fails', async () => {
        vi.mocked(lightdashApi).mockRejectedValue({
            error: { message: 'nope' },
        });
        const { queryClient, result } = setup();

        result.current.mutate({
            projectUuid: 'project-1',
            appUuid: 'app-1',
            alias: 'weather',
            name: 'Weather',
        });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(queryClient.getQueryData(queryKey)).toEqual(links);
    });
});
