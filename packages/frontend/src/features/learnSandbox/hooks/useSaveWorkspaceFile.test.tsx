import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { useSaveWorkspaceFile } from './useSaveWorkspaceFile';
import { workspaceFileQueryKey } from './useWorkspaceFile';
import { workspaceFilesQueryKey } from './useWorkspaceFiles';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));

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
    const { result } = renderHook(() => useSaveWorkspaceFile('p'), {
        wrapper,
    });
    return { queryClient, result };
};

describe('useSaveWorkspaceFile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('PUTs the content and invalidates both the file and file-list queries', async () => {
        vi.mocked(lightdashApi).mockResolvedValue(undefined);
        const { queryClient, result } = setup();
        queryClient.setQueryData(workspaceFilesQueryKey('p'), []);
        queryClient.setQueryData(workspaceFileQueryKey('p', 'a.sql'), {
            path: 'a.sql',
            content: 'old',
            editable: true,
        });

        result.current.mutate({ path: 'a.sql', content: 'select 1' });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: `/projects/p/learn/workspace/files/${encodeURIComponent('a.sql')}`,
                method: 'PUT',
                body: JSON.stringify({ content: 'select 1' }),
            }),
        );
        expect(
            queryClient.getQueryState(workspaceFilesQueryKey('p'))
                ?.isInvalidated,
        ).toBe(true);
        expect(
            queryClient.getQueryState(workspaceFileQueryKey('p', 'a.sql'))
                ?.isInvalidated,
        ).toBe(true);
    });
});
