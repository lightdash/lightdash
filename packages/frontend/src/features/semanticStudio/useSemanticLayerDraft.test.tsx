import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { countPublishedChanges } from './modelCode';
import { draftModel } from './studioCheckout.mock';
import { useSemanticLayerDraft } from './useSemanticLayerModel';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastInfo: vi.fn(), showToastApiError: vi.fn() }),
}));
vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => api,
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({ user: { data: undefined } }),
}));

describe('useSemanticLayerDraft', () => {
    it('reads a draft from a server that predates project context as one with none', async () => {
        // What a server from before drafted project context answers.
        api.mockResolvedValue({
            changes: [
                {
                    draftChangeUuid: 'change-1',
                    question: null,
                    createdAt: new Date(0),
                    models: [],
                },
            ],
            models: [draftModel('orders', 'a', 'b')],
            errors: [],
            settled: [],
            inReview: [],
            othersDrafting: [],
        });
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const wrapper = ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
        const { result } = renderHook(() => useSemanticLayerDraft('project'), {
            wrapper,
        });
        await waitFor(() => expect(result.current.data).toBeDefined());
        const draft = result.current.data!;
        expect(draft.projectContext).toBeNull();
        expect(draft.changes[0].projectContextEntries).toEqual([]);
        expect(countPublishedChanges(draft, null)).toBe(1);
    });
});
