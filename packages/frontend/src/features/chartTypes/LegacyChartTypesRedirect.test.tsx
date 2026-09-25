import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import LegacyChartTypesRedirect from './LegacyChartTypesRedirect';

describe('LegacyChartTypesRedirect', () => {
    it.each(['3675b69e-8324-4110-bdca-059031aa8da3', 'jaffle-shop'])(
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
});
