import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import LegacyChartTypesRedirect from './LegacyChartTypesRedirect';

describe('LegacyChartTypesRedirect', () => {
    const projectIds = ['3675b69e-8324-4110-bdca-059031aa8da3', 'jaffle-shop'];

    it.each(projectIds)(
        'preserves the project, query and hash and replaces the legacy entry for %s',
        async (projectId) => {
            const projectPath = `/projects/${projectId}`;
            const router = createMemoryRouter(
                [
                    {
                        path: '/projects/:projectUuid',
                        children: [
                            { path: 'home', element: <div>Project home</div> },
                            {
                                path: 'chart-types',
                                element: <LegacyChartTypesRedirect />,
                            },
                            {
                                path: 'chart-studio',
                                element: <div>Chart Studio</div>,
                            },
                        ],
                    },
                ],
                {
                    initialEntries: [
                        `${projectPath}/home`,
                        `${projectPath}/chart-types?tab=chart-library#installed`,
                    ],
                    initialIndex: 1,
                },
            );
            render(<RouterProvider router={router} />);

            expect(await screen.findByText('Chart Studio')).toBeInTheDocument();
            expect(router.state.location).toMatchObject({
                pathname: `${projectPath}/chart-studio`,
                search: '?tab=chart-library',
                hash: '#installed',
            });

            await act(async () => router.navigate(-1));

            expect(await screen.findByText('Project home')).toBeInTheDocument();
        },
    );

    it.each(
        projectIds.flatMap((projectId) =>
            ['new', 'radial-gauge', '3675b69e-8324-4110-bdca-059031aa8da3'].map(
                (chartTypeId) => ({ projectId, chartTypeId }),
            ),
        ),
    )(
        'redirects $projectId/chart-types/$chartTypeId without losing query, hash or history',
        async ({ projectId, chartTypeId }) => {
            const projectPath = `/projects/${projectId}`;
            const router = createMemoryRouter(
                [
                    {
                        path: '/projects/:projectUuid',
                        children: [
                            { path: 'home', element: <div>Project home</div> },
                            {
                                path: 'chart-types/new',
                                element: (
                                    <LegacyChartTypesRedirect newChartType />
                                ),
                            },
                            {
                                path: 'chart-types/:dataAppVizUuid',
                                element: <LegacyChartTypesRedirect />,
                            },
                            {
                                path: 'chart-studio/new',
                                element: <div>Chart Studio builder</div>,
                            },
                            {
                                path: 'chart-studio/:dataAppVizUuid',
                                element: <div>Chart Studio builder</div>,
                            },
                        ],
                    },
                ],
                {
                    initialEntries: [
                        `${projectPath}/home`,
                        `${projectPath}/chart-types/${chartTypeId}?savedChartUuid=chart-1#settings`,
                    ],
                    initialIndex: 1,
                },
            );
            render(<RouterProvider router={router} />);

            expect(
                await screen.findByText('Chart Studio builder'),
            ).toBeInTheDocument();
            expect(router.state.location).toMatchObject({
                pathname: `${projectPath}/chart-studio/${chartTypeId}`,
                search: '?savedChartUuid=chart-1',
                hash: '#settings',
            });

            await act(async () => router.navigate(-1));

            expect(await screen.findByText('Project home')).toBeInTheDocument();
        },
    );
});
