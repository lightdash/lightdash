import { act, renderHook } from '@testing-library/react';
import { StrictMode, type PropsWithChildren } from 'react';
import { MemoryRouter, useNavigate } from 'react-router';
import {
    useAnalyticsProjectRouteView,
    useAnalyticsProjectView,
} from './useAnalyticsProjectView';

const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => api.request,
}));

const analyticsProject = {
    organizationUuid: 'organization-uuid',
    projectUuid: 'analytics-project-uuid',
    provisioningSource: 'analytics',
};
const homepage = '/projects/analytics-project-slug/home';

const wrapper = ({ children }: PropsWithChildren) => (
    <StrictMode>
        <MemoryRouter initialEntries={[homepage]}>{children}</MemoryRouter>
    </StrictMode>
);

describe('analytics project visits', () => {
    beforeEach(() => {
        api.request = vi.fn().mockResolvedValue(undefined);
    });

    it('waits for managed project metadata and emits canonical IDs once in StrictMode', () => {
        const { rerender } = renderHook(
            ({ project }) => useAnalyticsProjectRouteView(project),
            {
                wrapper,
                initialProps: {
                    project: undefined as typeof analyticsProject | undefined,
                },
            },
        );
        expect(api.request).not.toHaveBeenCalled();

        rerender({ project: analyticsProject });
        rerender({ project: { ...analyticsProject } });

        expect(api.request).toHaveBeenCalledExactlyOnceWith({
            url: '/org/analytics-project/view',
            method: 'POST',
            body: JSON.stringify({
                projectUuid: analyticsProject.projectUuid,
                source: 'homepage',
            }),
        });
    });

    it('counts route revisits but not filters or changes to the API callback', async () => {
        const { result, rerender } = renderHook(
            () => {
                useAnalyticsProjectRouteView(analyticsProject);
                return useNavigate();
            },
            { wrapper },
        );
        const initialRequest = api.request;
        expect(initialRequest).toHaveBeenCalledTimes(1);

        api.request = vi.fn().mockResolvedValue(undefined);
        rerender();
        await act(() => result.current(`${homepage}?filters=changed#section`));
        expect(api.request).not.toHaveBeenCalled();

        await act(() =>
            result.current('/projects/analytics-project-slug/dashboards/users'),
        );
        await act(() => result.current(homepage));

        expect(api.request).toHaveBeenCalledTimes(2);
        expect(api.request.mock.calls.map(([request]) => request.body)).toEqual(
            ['project', 'homepage'].map((source) =>
                JSON.stringify({
                    projectUuid: analyticsProject.projectUuid,
                    source,
                }),
            ),
        );
    });

    it('ignores ordinary projects', () => {
        renderHook(
            () =>
                useAnalyticsProjectRouteView({
                    ...analyticsProject,
                    provisioningSource: 'other',
                }),
            { wrapper },
        );
        expect(api.request).not.toHaveBeenCalled();
    });

    it('counts one AI visit across default agent redirects and thread navigation', async () => {
        const aiPath = '/projects/analytics-project-slug/ai-agents';
        const { result } = renderHook(
            () => {
                useAnalyticsProjectRouteView(analyticsProject);
                return useNavigate();
            },
            {
                wrapper: ({ children }) => (
                    <MemoryRouter initialEntries={[aiPath]}>
                        {children}
                    </MemoryRouter>
                ),
            },
        );
        const canonicalAiPath = `/projects/${analyticsProject.projectUuid}/ai-agents`;
        await act(() => result.current(`${canonicalAiPath}/agent`));
        await act(() =>
            result.current(`${canonicalAiPath}/agent/threads/thread`),
        );
        expect(api.request).toHaveBeenCalledExactlyOnceWith({
            url: '/org/analytics-project/view',
            method: 'POST',
            body: JSON.stringify({
                projectUuid: analyticsProject.projectUuid,
                source: 'project',
            }),
        });
        await act(() => result.current(homepage));
        await act(() => result.current(`${aiPath}/agent`));
        expect(api.request).toHaveBeenCalledTimes(3);
    });

    it('preserves a visit across failed polls but counts returning through an untracked route', async () => {
        const { result, rerender } = renderHook(
            ({ available }) => {
                useAnalyticsProjectRouteView(
                    available ? analyticsProject : undefined,
                );
                return useNavigate();
            },
            { wrapper, initialProps: { available: true } },
        );
        rerender({ available: false });
        rerender({ available: true });
        expect(api.request).toHaveBeenCalledTimes(1);

        rerender({ available: false });
        await act(() => result.current('/projects/ordinary-project/home'));
        await act(() => result.current(homepage));
        rerender({ available: true });
        expect(api.request).toHaveBeenCalledTimes(2);
    });

    it('counts settings even before setup without counting creation or polling as another visit', () => {
        const { rerender } = renderHook(
            ({ projectUuid }: { projectUuid: string | null }) =>
                useAnalyticsProjectView({
                    organizationId: analyticsProject.organizationUuid,
                    projectUuid,
                    source: 'settings',
                }),
            { wrapper, initialProps: { projectUuid: null as string | null } },
        );

        rerender({ projectUuid: analyticsProject.projectUuid });
        rerender({ projectUuid: analyticsProject.projectUuid });
        expect(api.request).toHaveBeenCalledExactlyOnceWith({
            url: '/org/analytics-project/view',
            method: 'POST',
            body: JSON.stringify({
                projectUuid: null,
                source: 'settings',
            }),
        });
    });

    it('does not break the page or repeatedly retry when tracking throws', () => {
        api.request.mockImplementation(() => {
            throw new Error('Telemetry unavailable');
        });
        const { rerender } = renderHook(
            () => useAnalyticsProjectRouteView(analyticsProject),
            { wrapper },
        );
        expect(() => rerender()).not.toThrow();
        expect(api.request).toHaveBeenCalledTimes(1);
    });
});
