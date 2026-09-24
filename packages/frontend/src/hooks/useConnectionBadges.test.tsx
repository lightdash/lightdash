import {
    WarehouseTypes,
    type WarehouseConnectionForUserCredentials,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { vi, type Mock } from 'vitest';
import { lightdashApi } from '../api';
import {
    useConnectionBadges,
    useExploreConnectionName,
} from './useConnectionBadges';

vi.mock('../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('./useQueryError', () => ({
    default: () => vi.fn(),
}));

let mockEmbedToken: string | undefined;
vi.mock('../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ embedToken: mockEmbedToken }),
}));

const mockApi = lightdashApi as unknown as Mock;

const connection = (
    warehouseConnectionUuid: string,
    name: string,
    isOriginal: boolean,
): WarehouseConnectionForUserCredentials => ({
    warehouseConnectionUuid,
    name,
    isOriginal,
    warehouseType: WarehouseTypes.POSTGRES,
    requireUserCredentials: false,
});

const original = connection('original-uuid', 'Warehouse', true);
const finance = connection('finance-uuid', 'Finance', false);
const CONNECTIONS_URL =
    '/projects/project-uuid/warehouse-connection-user-credentials';

const serve = (
    connectionRoute: 'single' | 'multi',
    connections: WarehouseConnectionForUserCredentials[],
) =>
    mockApi.mockImplementation(async ({ url }: { url: string }) => {
        if (url === '/projects/project-uuid') {
            return { projectUuid: 'project-uuid', connectionRoute };
        }
        if (url === CONNECTIONS_URL) return connections;
        if (url.startsWith('/projects/project-uuid/explores')) {
            return [
                { name: 'orders', warehouseConnectionUuid: null },
                { name: 'payments', warehouseConnectionUuid: 'finance-uuid' },
            ];
        }
        throw new Error(`Unexpected request ${url}`);
    });

const wrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

const requestedUrls = () =>
    mockApi.mock.calls.map(([request]) => (request as { url: string }).url);

describe('useConnectionBadges', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockEmbedToken = undefined;
    });

    it('shows no badges and reads no connections for a project that routes single', async () => {
        serve('single', [original, finance]);
        const { result } = renderHook(
            () => useConnectionBadges('project-uuid'),
            { wrapper: wrapper() },
        );

        await waitFor(() =>
            expect(requestedUrls()).toContain('/projects/project-uuid'),
        );
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(result.current).toBeNull();
        expect(requestedUrls()).not.toContain(CONNECTIONS_URL);
    });

    it('shows no badges for a multi project with one connection', async () => {
        serve('multi', [original]);
        const { result } = renderHook(
            () => useConnectionBadges('project-uuid'),
            { wrapper: wrapper() },
        );

        await waitFor(() => expect(requestedUrls()).toContain(CONNECTIONS_URL));
        expect(result.current).toBeNull();
    });

    it('returns the connections of a multi project with two connections', async () => {
        serve('multi', [original, finance]);
        const { result } = renderHook(
            () => useConnectionBadges('project-uuid'),
            { wrapper: wrapper() },
        );

        await waitFor(() =>
            expect(result.current).toEqual([original, finance]),
        );
    });

    it('shows no badges in an embed and reads nothing', async () => {
        mockEmbedToken = 'embed-token';
        serve('multi', [original, finance]);
        const { result } = renderHook(
            () => useConnectionBadges('project-uuid'),
            { wrapper: wrapper() },
        );

        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(result.current).toBeNull();
        expect(mockApi).not.toHaveBeenCalled();
    });
});

describe('useExploreConnectionName', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockEmbedToken = undefined;
    });

    it.each([
        ['payments', 'Finance'],
        ['orders', 'Warehouse'],
    ])('names the connection of %s', async (exploreName, name) => {
        serve('multi', [original, finance]);
        const { result } = renderHook(
            () => useExploreConnectionName('project-uuid', exploreName),
            { wrapper: wrapper() },
        );

        await waitFor(() => expect(result.current).toBe(name));
    });

    it('names nothing and reads no explores for a project that routes single', async () => {
        serve('single', [original, finance]);
        const { result } = renderHook(
            () => useExploreConnectionName('project-uuid', 'payments'),
            { wrapper: wrapper() },
        );

        await waitFor(() =>
            expect(requestedUrls()).toContain('/projects/project-uuid'),
        );
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(result.current).toBeNull();
        expect(requestedUrls().some((url) => url.includes('/explores'))).toBe(
            false,
        );
    });
});
