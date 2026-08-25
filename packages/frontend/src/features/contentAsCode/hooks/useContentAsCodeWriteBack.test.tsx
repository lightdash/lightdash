import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { useContentAsCodeWriteBackStatus } from './useContentAsCodeWriteBack';

vi.mock('../../../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({ user: { data: null } }),
}));

vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: vi.fn(),
        showToastApiError: vi.fn(),
    }),
}));

const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
});

const QueryWrapper: FC<PropsWithChildren> = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useContentAsCodeWriteBackStatus', () => {
    it('loads write-back status for a slug', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({
            contentType: 'chart',
            slug: 'orders',
            syncEnabled: true,
            writeBackEnabled: true,
            state: 'ahead',
            writeBack: {
                prState: 'merged',
                prUrl: 'https://example.com/pull/9',
                prTitle: 'Update chart `orders`',
            },
        });

        const { result } = renderHook(
            () =>
                useContentAsCodeWriteBackStatus(
                    'project-uuid',
                    'chart',
                    'orders',
                    true,
                ),
            { wrapper: QueryWrapper },
        );

        await waitFor(() => {
            expect(result.current.data?.writeBack.prState).toBe('merged');
        });
        expect(vi.mocked(lightdashApi).mock.calls[0][0].url).toContain(
            'write-back-status',
        );
    });
});
