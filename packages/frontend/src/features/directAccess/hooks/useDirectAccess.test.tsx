import {
    DirectAccessPrincipalType,
    DirectAccessResourceType,
    SpaceMemberRole,
} from '@lightdash/common';
import {
    QueryClient,
    QueryClientProvider,
    useQuery,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useUpsertDirectAccessAssignment } from './useDirectAccess';

vi.mock('../api', () => ({
    upsertDirectAccessAssignment: vi.fn().mockResolvedValue(undefined),
    revokeDirectAccessAssignment: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: vi.fn(), showToastApiError: vi.fn() }),
}));

describe('direct access resource permission refresh', () => {
    it.each([
        {
            resourceType: DirectAccessResourceType.DOCUMENT,
            key: ['document', 'project', 'document-uuid'],
            otherKey: ['document', 'other-project', 'document-uuid'],
        },
        {
            resourceType: DirectAccessResourceType.DOCUMENT,
            key: [
                'document-chart-query',
                'project',
                'document-uuid',
                'version',
                'cell',
            ],
            otherKey: [
                'document-chart-query',
                'other-project',
                'document-uuid',
                'version',
                'cell',
            ],
        },
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
            key: ['saved_query', 'sql-slug', 'project', false],
            otherKey: ['saved_query', 'sql-slug', 'other-project', false],
        },
        {
            resourceType: DirectAccessResourceType.APP,
            key: ['app', 'project', 'app-slug'],
            otherKey: ['app', 'other-project', 'app-slug'],
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
