import {
    DirectAccessPrincipalType,
    DirectAccessResourceType,
    SpaceMemberRole,
    type SqlChart,
} from '@lightdash/common';
import {
    QueryClient,
    QueryClientProvider,
    useQuery,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useSavedSqlChartResults } from '../../sqlRunner/hooks/useSavedSqlChartResults';
import { fetchSavedSqlChart } from '../../sqlRunner/hooks/useSavedSqlCharts';
import {
    useRevokeDirectAccessAssignment,
    useUpsertDirectAccessAssignment,
} from './useDirectAccess';

vi.mock('../api', () => ({
    upsertDirectAccessAssignment: vi.fn().mockResolvedValue(undefined),
    revokeDirectAccessAssignment: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../sqlRunner/hooks/useSavedSqlCharts', () => ({
    fetchSavedSqlChart: vi.fn(),
}));
vi.mock('../../../hooks/useQueryRetry', () => ({
    useQueryRetryConfig: () => ({ retry: false }),
}));
vi.mock('../../../hooks/appearance/useProjectColorPalette', () => ({
    useProjectColorPalette: () => ({ data: undefined }),
}));
vi.mock('../../queryRunner/sqlRunnerPivotQueries', () => ({
    getSqlChartPivotChartData: () => new Promise(() => {}),
}));
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: vi.fn(), showToastApiError: vi.fn() }),
}));

describe('direct access resource permission refresh', () => {
    it.each(['downgrade', 'revoke'] as const)(
        'refreshes the actual SQL viewer after self-%s',
        async (operation) => {
            const chart = {
                savedSqlUuid: 'resource-uuid',
                space: {
                    userAccess: {
                        userUuid: 'current-user',
                        role: SpaceMemberRole.ADMIN,
                        hasDirectAccess: true,
                        projectRole: undefined,
                        inheritedRole: undefined,
                        inheritedFrom: undefined,
                    },
                },
            } as SqlChart;
            vi.mocked(fetchSavedSqlChart).mockResolvedValue(chart);
            const client = new QueryClient({
                defaultOptions: {
                    queries: { retry: false, staleTime: Infinity },
                },
            });
            const wrapper = ({ children }: PropsWithChildren) => (
                <QueryClientProvider client={client}>
                    {children}
                </QueryClientProvider>
            );
            const { result, unmount } = renderHook(
                () => {
                    const viewer = useSavedSqlChartResults({
                        projectUuid: 'project',
                        slug: 'sql-slug',
                    });
                    const target = {
                        resourceType: DirectAccessResourceType.SQL_CHART,
                        resourceUuid: 'resource-uuid',
                    };
                    const upsert = useUpsertDirectAccessAssignment(
                        'project',
                        target,
                    );
                    const revoke = useRevokeDirectAccessAssignment(
                        'project',
                        target,
                    );
                    return { viewer, upsert, revoke };
                },
                { wrapper },
            );
            await waitFor(() =>
                expect(
                    result.current.viewer.chartQuery.data?.space.userAccess
                        ?.role,
                ).toBe(SpaceMemberRole.ADMIN),
            );
            if (operation === 'downgrade') {
                vi.mocked(fetchSavedSqlChart).mockResolvedValue({
                    ...chart,
                    space: {
                        ...chart.space,
                        userAccess: {
                            userUuid: 'current-user',
                            role: SpaceMemberRole.VIEWER,
                            hasDirectAccess: true,
                            projectRole: undefined,
                            inheritedRole: undefined,
                            inheritedFrom: undefined,
                        },
                    },
                });
            } else {
                vi.mocked(fetchSavedSqlChart).mockRejectedValue({
                    status: 'error',
                    error: { statusCode: 403, message: 'Access removed' },
                });
            }
            await act(async () => {
                const principal = {
                    principalType: DirectAccessPrincipalType.USER,
                    principalUuid: 'current-user',
                };
                if (operation === 'downgrade') {
                    await result.current.upsert.mutateAsync({
                        ...principal,
                        role: SpaceMemberRole.VIEWER,
                    });
                } else {
                    await result.current.revoke.mutateAsync(principal);
                }
            });
            await waitFor(() => {
                if (operation === 'downgrade') {
                    expect(
                        result.current.viewer.chartQuery.data?.space.userAccess
                            ?.role,
                    ).toBe(SpaceMemberRole.VIEWER);
                } else {
                    expect(
                        result.current.viewer.chartQuery.error?.error
                            ?.statusCode,
                    ).toBe(403);
                }
            });
            unmount();
            client.clear();
        },
    );
    it.each([
        {
            resourceType: DirectAccessResourceType.CHART,
            key: ['saved_query', 'chart-slug', 'project', false],
            otherKey: ['saved_query', 'chart-slug', 'other-project', false],
        },
        {
            resourceType: DirectAccessResourceType.DASHBOARD,
            key: ['saved_dashboard_query', 'dashboard-slug', 'project', false],
            otherKey: [
                'saved_dashboard_query',
                'dashboard-slug',
                'other-project',
                false,
            ],
        },
        {
            resourceType: DirectAccessResourceType.SQL_CHART,
            key: [
                'sqlRunner',
                'savedSqlChart',
                'project',
                'sql-slug',
                undefined,
            ],
            otherKey: [
                'sqlRunner',
                'savedSqlChart',
                'other-project',
                'sql-slug',
                undefined,
            ],
        },
        {
            resourceType: DirectAccessResourceType.APP,
            key: ['app', 'project', 'app-slug'],
            otherKey: ['app', 'other-project', 'app-slug'],
        },
        {
            resourceType: DirectAccessResourceType.SQL_CHART,
            key: [
                'savedSqlChart',
                'sql-slug',
                'registered',
                undefined,
                'project',
            ],
            otherKey: [
                'savedSqlChart',
                'sql-slug',
                'registered',
                undefined,
                'other-project',
            ],
        },
        {
            resourceType: DirectAccessResourceType.SQL_CHART,
            key: [
                'savedSqlChart',
                'sql-slug',
                'registered',
                undefined,
                'project',
            ],
            otherKey: ['savedSqlChart', 'sql-slug', 'embed', 'tile', 'project'],
        },
    ])(
        'refreshes $resourceType permissions for slug routes without refetching other projects',
        async ({ resourceType, key, otherKey }) => {
            const client = new QueryClient({
                defaultOptions: {
                    queries: { retry: false, staleTime: Infinity },
                },
            });
            const fetchResource = vi
                .fn()
                .mockResolvedValue({ role: SpaceMemberRole.VIEWER });
            const fetchOther = vi
                .fn()
                .mockResolvedValue({ role: SpaceMemberRole.ADMIN });
            const wrapper = ({ children }: PropsWithChildren) => (
                <QueryClientProvider client={client}>
                    {children}
                </QueryClientProvider>
            );
            const { result, unmount } = renderHook(
                () => {
                    const resource = useQuery({
                        queryKey: key,
                        queryFn: fetchResource,
                        initialData: { role: SpaceMemberRole.ADMIN },
                    });
                    useQuery({
                        queryKey: otherKey,
                        queryFn: fetchOther,
                        initialData: { role: SpaceMemberRole.ADMIN },
                    });
                    const mutation = useUpsertDirectAccessAssignment(
                        'project',
                        { resourceType, resourceUuid: 'resource-uuid' },
                    );
                    return { resource, mutation };
                },
                { wrapper },
            );

            await act(async () => {
                await result.current.mutation.mutateAsync({
                    principalType: DirectAccessPrincipalType.USER,
                    principalUuid: 'current-user',
                    role: SpaceMemberRole.VIEWER,
                });
            });
            await waitFor(() =>
                expect(result.current.resource.data.role).toBe(
                    SpaceMemberRole.VIEWER,
                ),
            );
            expect(fetchOther).not.toHaveBeenCalled();
            unmount();
            client.clear();
        },
    );
});
