import { type Project } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { mockedLightdashApi } from '../testing/mockedLightdashApi';
import { ProjectRouteContext } from './useProjectRoute';
import { useResolvedProjectUrlIdentifier } from './useResolvedProjectUrlIdentifier';

vi.mock('../api');

const routeProject = {
    projectUuid: 'route-project',
    slug: 'route-slug',
} as Project;

describe('Project URL identifier outside and inside a project route', () => {
    const clients: QueryClient[] = [];
    beforeEach(() => mockedLightdashApi.mockReset());
    afterEach(() => clients.forEach((client) => client.clear()));

    const wrapper =
        (withRoute: boolean) =>
        ({ children }: PropsWithChildren) => {
            const client = new QueryClient({
                defaultOptions: { queries: { retry: false } },
            });
            clients.push(client);
            const tree = withRoute ? (
                <ProjectRouteContext.Provider
                    value={{
                        project: routeProject,
                        projectUuid: routeProject.projectUuid,
                        projectUrlIdentifier: 'route-slug',
                    }}
                >
                    {children}
                </ProjectRouteContext.Provider>
            ) : (
                children
            );
            return (
                <QueryClientProvider client={client}>
                    {tree}
                </QueryClientProvider>
            );
        };

    it('uses the project slug from the API when no project route is mounted', async () => {
        mockedLightdashApi.mockResolvedValue({
            projectUuid: 'other-project',
            slug: 'other-slug',
        });
        const { result } = renderHook(
            () => useResolvedProjectUrlIdentifier('other-project'),
            { wrapper: wrapper(false) },
        );
        expect(result.current).toBe('other-project');
        await waitFor(() => expect(result.current).toBe('other-slug'));
        expect(mockedLightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({ url: '/projects/other-project' }),
        );
    });

    it('reuses the route identifier for the route project without fetching', async () => {
        const { result } = renderHook(
            () => useResolvedProjectUrlIdentifier(routeProject.projectUuid),
            { wrapper: wrapper(true) },
        );
        expect(result.current).toBe('route-slug');
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(mockedLightdashApi).not.toHaveBeenCalled();
    });

    it('resolves a different project than the route project from the API', async () => {
        mockedLightdashApi.mockResolvedValue({
            projectUuid: 'other-project',
            slug: 'other-slug',
        });
        const { result } = renderHook(
            () => useResolvedProjectUrlIdentifier('other-project'),
            { wrapper: wrapper(true) },
        );
        await waitFor(() => expect(result.current).toBe('other-slug'));
    });
});
