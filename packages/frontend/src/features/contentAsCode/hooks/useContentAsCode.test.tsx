import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useContentAsCode } from './useContentAsCode';

const selectDocument = (results: { documents: object[] }) =>
    results.documents[0];
const fieldsToOmit = ['downloadedAt'];
const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
});

const QueryWrapper: FC<PropsWithChildren> = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useContentAsCode', () => {
    it('fetches only when enabled and creates deterministic YAML', async () => {
        const queryFn = vi.fn().mockResolvedValue({
            documents: [
                {
                    version: 1,
                    name: 'Revenue dashboard',
                    downloadedAt: '2026-07-21T08:00:00.000Z',
                    contentType: 'dashboard',
                },
            ],
        });

        const { result, rerender } = renderHook(
            ({ enabled }) =>
                useContentAsCode({
                    queryKey: ['content-as-code-test'],
                    queryFn,
                    selectDocument,
                    fieldsToOmit,
                    enabled,
                }),
            {
                initialProps: { enabled: false },
                wrapper: QueryWrapper,
            },
        );

        expect(queryFn).not.toHaveBeenCalled();
        expect(result.current.contentYaml).toBeUndefined();

        rerender({ enabled: true });

        await waitFor(() => expect(queryFn).toHaveBeenCalledOnce());
        await waitFor(() =>
            expect(result.current.contentYaml).toBe(
                'contentType: dashboard\nname: Revenue dashboard\nversion: 1\n',
            ),
        );
    });
});
