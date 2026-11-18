import {
    type SemanticLayerDraft,
    type SummaryExplore,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { draftModel, draftOf, workspaceOf } from './studioCheckout.mock';
import {
    foldDraftExplores,
    StudioCheckoutProvider,
    useCheckOut,
    useStudioCheckout,
    useStudioCheckoutState,
} from './useStudioCheckout';
import { WORKSPACES_KEY } from './useStudioWorkspaces';

const api = vi.hoisted(() => vi.fn());
const showToastInfo = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastInfo, showToastApiError: vi.fn() }),
}));
vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => api,
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));

const liveSummary = (name: string): SummaryExplore => ({
    name,
    label: name,
    tags: [],
    databaseName: 'db',
    schemaName: 'public',
    warehouseConnectionUuid: null,
});

const draftA = draftOf([draftModel('orders', 'a', 'a2', 'Orders A')]);
const draftB = draftOf([draftModel('orders', 'a', 'a3', 'Orders B')]);

/** A server whose checkout can move, answering each change's draft only when told to. */
const setup = (initial: string | null) => {
    let active = initial;
    const waiting = new Map<string, (draft: SemanticLayerDraft) => void>();
    api.mockImplementation(({ url }: { url: string }) => {
        if (url.endsWith('/status')) {
            return Promise.resolve({ enabled: true, appliesAs: 'live' });
        }
        const activated = /\/workspaces\/(\w+)\/activate$/.exec(url)?.[1];
        if (activated) {
            active = activated;
            return Promise.resolve(workspaceOf(activated));
        }
        if (url.endsWith('/workspaces')) {
            return Promise.resolve({
                mine: ['A', 'B'].map((id) =>
                    workspaceOf(id, { isActive: id === active }),
                ),
                others: [],
                recent: [],
            });
        }
        const workspace = /\/workspaces\/(\w+)\/draft$/.exec(url)?.[1];
        if (!workspace) return Promise.reject(new Error(`Unexpected ${url}`));
        return new Promise<SemanticLayerDraft>((resolve) =>
            waiting.set(workspace, resolve),
        );
    });
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const Checkout = ({ children }: PropsWithChildren) => (
        <StudioCheckoutProvider value={useStudioCheckoutState('project')}>
            {children}
        </StudioCheckoutProvider>
    );
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>
            <Checkout>{children}</Checkout>
        </QueryClientProvider>
    );
    const { result } = renderHook(
        () => ({ ...useStudioCheckout(), picker: useCheckOut('project') }),
        { wrapper },
    );
    return {
        result,
        checkOut: async (next: string | null) => {
            active = next;
            await act(() =>
                client.invalidateQueries({ queryKey: [WORKSPACES_KEY] }),
            );
        },
        requested: (workspace: string) =>
            waitFor(() => expect(waiting.has(workspace)).toBe(true)),
        answer: async (workspace: string, draft: SemanticLayerDraft) => {
            await waitFor(() => expect(waiting.has(workspace)).toBe(true));
            act(() => waiting.get(workspace)?.(draft));
        },
    };
};

const shownUuid = (state: ReturnType<typeof useStudioCheckout>) =>
    state.shown?.workspace?.workspaceUuid ?? null;

describe('useStudioCheckoutState', () => {
    it('keeps the current change on screen until the next has loaded, from A to B to Live', async () => {
        const { result, checkOut, answer } = setup('A');
        await answer('A', draftA);
        await waitFor(() => expect(shownUuid(result.current)).toBe('A'));
        expect(result.current.shown?.draft).toEqual(draftA);

        await checkOut('B');
        await waitFor(() => expect(result.current.isSwitching).toBe(true));
        expect(shownUuid(result.current)).toBe('A');
        await answer('B', draftB);
        await waitFor(() => expect(shownUuid(result.current)).toBe('B'));
        expect(result.current.shown?.draft).toEqual(draftB);
        expect(result.current.isSwitching).toBe(false);

        await checkOut(null);
        await waitFor(() =>
            expect(result.current.shown).toEqual({
                workspace: null,
                draft: null,
            }),
        );
    });

    it('drops a late answer for a change that is no longer checked out', async () => {
        const { result, checkOut, answer, requested } = setup('A');
        await requested('A');
        await checkOut('B');
        await answer('B', draftB);
        await waitFor(() => expect(shownUuid(result.current)).toBe('B'));
        await answer('A', draftA);
        expect(shownUuid(result.current)).toBe('B');
        expect(result.current.shown?.draft).toEqual(draftB);
    });
});

describe('the checkout leaving Live', () => {
    it('says which change an agent edit started and checked out', async () => {
        showToastInfo.mockClear();
        const { result, checkOut, answer } = setup(null);
        await waitFor(() => expect(result.current.shown?.workspace).toBe(null));
        await checkOut('A');
        await answer('A', draftA);
        await waitFor(() => expect(shownUuid(result.current)).toBe('A'));
        expect(showToastInfo).toHaveBeenCalledTimes(1);
        expect(showToastInfo).toHaveBeenCalledWith({
            title: 'Now on Change A',
        });
    });

    it('says nothing when the person checks out a change themselves', async () => {
        showToastInfo.mockClear();
        const { result, answer } = setup(null);
        await waitFor(() => expect(result.current.shown?.workspace).toBe(null));
        act(() => result.current.picker.checkOut(workspaceOf('A')));
        await answer('A', draftA);
        await waitFor(() => expect(shownUuid(result.current)).toBe('A'));
        expect(showToastInfo).not.toHaveBeenCalled();
    });
});

describe('foldDraftExplores', () => {
    const live = [liveSummary('orders'), liveSummary('customers')];

    it('is live with no change checked out', () => {
        expect(foldDraftExplores(live, null)).toBe(live);
    });

    it('adds the models a change adds and leaves out the ones it removes', () => {
        const folded = foldDraftExplores(
            live,
            draftOf([
                draftModel('customers', 'c', null),
                draftModel('payments', null, 'p', 'Payments'),
            ]),
        );
        expect(folded.map(({ name, label }) => [name, label])).toEqual([
            ['orders', 'orders'],
            ['payments', 'Payments'],
        ]);
    });

    it('shows an edited model as the change leaves it, and keeps it live when the change does not compile', () => {
        const folded = foldDraftExplores(
            live,
            draftOf([
                draftModel('orders', 'o', 'o2', 'Orders renamed'),
                { ...draftModel('customers', 'c', 'c2'), explore: null },
            ]),
        );
        expect(folded.map(({ label }) => label)).toEqual([
            'Orders renamed',
            'customers',
        ]);
    });
});
