import { WarehouseTypes, type WarehouseConnection } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { sharedLightdashApi } from '../api';
import { useWarehouseConnections } from './useWarehouseConnections';

vi.mock('../api');
const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('./useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: flag.enabled } }),
}));

const mockApi = sharedLightdashApi as unknown as Mock;

const original: WarehouseConnection = {
    warehouseConnectionUuid: 'original-uuid',
    projectUuid: 'project-uuid',
    name: 'Warehouse',
    isOriginal: true,
    warehouseType: WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
};

const apiError = (name: string, statusCode: number) => ({
    status: 'error',
    error: { name, message: 'Refused.', statusCode, data: {} },
});

const renderConnections = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
    return renderHook(() => useWarehouseConnections('project-uuid'), {
        wrapper,
    });
};

describe('useWarehouseConnections', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        flag.enabled = true;
    });

    it('calls no API while the rollout flag is off', async () => {
        flag.enabled = false;
        const { result } = renderConnections();

        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(result.current.isEnabled).toBe(false);
        expect(result.current.data).toBeUndefined();
        expect(mockApi).not.toHaveBeenCalled();
    });

    it('returns the listing in multiple mode', async () => {
        const capabilities = { canAddConnection: true, reason: null };
        mockApi.mockResolvedValue({ connections: [original], capabilities });
        const { result } = renderConnections();

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual({
            mode: 'multiple',
            connections: [original],
            capabilities,
        });
        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project-uuid/warehouse-connections',
                method: 'GET',
            }),
        );
    });

    it('maps the 409 single-connection answer to single mode without an error', async () => {
        mockApi.mockRejectedValue(
            apiError('SingleConnectionProjectError', 409),
        );
        const { result } = renderConnections();

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual({ mode: 'single' });
        expect(result.current.error).toBeNull();
    });

    it.each([
        { name: 'ConflictError', statusCode: 409 },
        { name: 'SingleConnectionProjectError', statusCode: 400 },
        { name: 'ForbiddenError', statusCode: 403 },
    ])(
        'keeps $name ($statusCode) as an error',
        async ({ name, statusCode }) => {
            const error = apiError(name, statusCode);
            mockApi.mockRejectedValue(error);
            const { result } = renderConnections();

            await waitFor(() => expect(result.current.isError).toBe(true));
            expect(result.current.error).toEqual(error);
            expect(result.current.data).toBeUndefined();
        },
    );
});
