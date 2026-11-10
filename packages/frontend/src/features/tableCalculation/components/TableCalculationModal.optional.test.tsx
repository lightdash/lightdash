import { Ability } from '@casl/ability';
import {
    CommercialFeatureFlags,
    FeatureFlags,
    type ApiError,
    type HealthState,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import {
    QueryClient,
    QueryClientProvider,
    type UseQueryResult,
} from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import nock from 'nock';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { createLightdashApi } from '../../../api';
import { type UserWithAbility } from '../../../hooks/user/useUser';
import AppProviderContext from '../../../providers/App/context';
import { LightdashApiContext } from '../../../providers/LightdashApi/LightdashApiContext';
import { createExplorerStore } from '../../explorer/store';
import TableCalculationModal from './TableCalculationModal';

const toast = vi.hoisted(() => vi.fn());
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastApiError: toast, addToastError: toast }),
}));
vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project',
}));
vi.mock('../../../hooks/useExploreWarehouseConnection', () => ({
    useExploreWarehouseConnection: () => ({ warehouseType: 'postgres' }),
    useMixedWarehouseConnectionsEnabled: () => false,
}));
const query = <T,>(data: T) =>
    ({
        data,
        isSuccess: true,
        isLoading: false,
        isFetching: false,
        isError: false,
    }) as UseQueryResult<T, ApiError>;
afterEach(() => {
    cleanup();
    nock.cleanAll();
    toast.mockClear();
});
it.each([false, true])(
    'mounted modal discovers optional identity only with health availability %s, even when Copilot is on',
    async (available) => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: Infinity } },
        });
        const health = {
            isAuthenticated: true,
            ai: { isAmbientAiEnabled: available },
        } as HealthState;
        const user = {
            userUuid: 'person',
            organizationUuid: 'organization',
            ability: new Ability([]),
        } as UserWithAbility;
        queryClient.setQueryData(['health'], health);
        const seen: string[] = [];
        for (const flag of [
            FeatureFlags.AgentIdentity,
            CommercialFeatureFlags.AiCopilot,
            CommercialFeatureFlags.CustomRoles,
        ]) {
            nock('http://test.lightdash')
                .persist()
                .get(`/api/v2/feature-flag/${flag}`)
                .reply(() => {
                    seen.push(flag);
                    return [
                        200,
                        {
                            status: 'ok',
                            results: {
                                enabled:
                                    flag !== CommercialFeatureFlags.CustomRoles,
                            },
                        },
                    ];
                });
        }
        nock('http://test.lightdash')
            .get('/api/v2/projects/project/ai-access/me')
            .reply(() => {
                seen.push('identity');
                return [
                    200,
                    { status: 'ok', results: { enabled: true, refusal: null } },
                ];
            });
        const view = render(
            <QueryClientProvider client={queryClient}>
                <LightdashApiContext.Provider
                    value={createLightdashApi(() => undefined)}
                >
                    <AppProviderContext.Provider
                        value={{ health: query(health), user: query(user) }}
                    >
                        <MemoryRouter>
                            <Provider store={createExplorerStore()}>
                                <MantineProvider>
                                    <TableCalculationModal
                                        opened={false}
                                        onClose={vi.fn()}
                                        onSave={vi.fn()}
                                    />
                                </MantineProvider>
                            </Provider>
                        </MemoryRouter>
                    </AppProviderContext.Provider>
                </LightdashApiContext.Provider>
            </QueryClientProvider>,
        );
        if (available) await waitFor(() => expect(seen).toContain('identity'));
        else {
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 40));
            });
            expect(seen).not.toContain('identity');
            expect(seen).not.toContain(FeatureFlags.AgentIdentity);
        }
        expect(toast).not.toHaveBeenCalled();
        view.unmount();
        queryClient.clear();
    },
);
