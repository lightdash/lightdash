import { type DocumentSummary } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import Documents from './Documents';

const mocks = vi.hoisted(() => ({
    api: vi.fn(),
    flag: { data: { enabled: true }, isInitialLoading: false, isError: false },
}));

vi.mock('../api', () => ({ lightdashApi: mocks.api }));
vi.mock('../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));
vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => mocks.flag,
}));
vi.mock('../components/common/Page/Page', () => ({
    default: ({
        children,
        header,
    }: {
        children: ReactNode;
        header: ReactNode;
    }) => (
        <main>
            {header}
            {children}
        </main>
    ),
}));

const firstDocument: DocumentSummary = {
    documentUuid: 'document-uuid',
    projectUuid: 'project-uuid',
    organizationUuid: 'org-uuid',
    spaceUuid: 'space-uuid',
    name: 'Weekly review',
    slug: 'weekly-review',
    description: 'Revenue and next steps',
    createdAt: new Date('2026-09-15'),
    updatedAt: new Date('2026-09-15'),
    createdByUserUuid: null,
};

const renderPage = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, cacheTime: 0 } },
        logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
    const router = createMemoryRouter(
        [
            {
                path: '/projects/:projectUuid/documents',
                element: <Documents />,
            },
            {
                path: '/projects/:projectUuid/home',
                element: <div>Project home</div>,
            },
            {
                path: '/projects/:projectUuid/documents/:documentUuid',
                element: <div>Document detail</div>,
            },
        ],
        { initialEntries: ['/projects/project-slug/documents'] },
    );
    render(
        <QueryClientProvider client={queryClient}>
            <MantineProvider env="test">
                <RouterProvider router={router} />
            </MantineProvider>
        </QueryClientProvider>,
    );
    return router;
};

describe('Documents page', () => {
    beforeEach(() => {
        mocks.api.mockReset();
        mocks.api.mockResolvedValue({
            items: [firstDocument],
            nextOffset: null,
        });
        mocks.flag = {
            data: { enabled: true },
            isInitialLoading: false,
            isError: false,
        };
    });

    test('does not request documents while the feature flag is loading', () => {
        mocks.flag.isInitialLoading = true;
        renderPage();

        expect(screen.getByText('Loading documents')).toBeInTheDocument();
        expect(mocks.api).not.toHaveBeenCalled();
    });

    test.each([
        { data: { enabled: false }, isInitialLoading: false, isError: false },
        { data: { enabled: true }, isInitialLoading: false, isError: true },
    ])(
        'redirects disabled or failed flag lookups without fetching documents',
        async (flag) => {
            mocks.flag = flag;
            const router = renderPage();

            expect(await screen.findByText('Project home')).toBeInTheDocument();
            expect(router.state.location.pathname).toBe(
                '/projects/project-uuid/home',
            );
            expect(mocks.api).not.toHaveBeenCalled();
        },
    );

    test('shows the loading state while the list request is pending', async () => {
        mocks.api.mockReturnValue(new Promise(() => {}));
        renderPage();

        await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
        expect(screen.getByText('Loading documents')).toBeInTheDocument();
    });

    test('uses the resolved project UUID and opens a canonical document link', async () => {
        const router = renderPage();
        const link = await screen.findByRole('link', { name: 'Weekly review' });

        expect(mocks.api).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project-uuid/documents?limit=50&offset=0',
                method: 'GET',
            }),
        );
        expect(screen.getByText('Revenue and next steps')).toBeInTheDocument();
        expect(link).toHaveAttribute(
            'href',
            '/projects/project-uuid/documents/document-uuid',
        );
        expect(
            screen.queryByRole('button', { name: /create/i }),
        ).not.toBeInTheDocument();
        fireEvent.click(link);
        expect(await screen.findByText('Document detail')).toBeInTheDocument();
        expect(router.state.location.pathname).toBe(
            '/projects/project-uuid/documents/document-uuid',
        );
    });

    test('shows a useful empty state without authoring actions', async () => {
        mocks.api.mockResolvedValue({ items: [], nextOffset: null });
        renderPage();

        expect(await screen.findByText('No documents yet')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /create/i }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Next' }),
        ).not.toBeInTheDocument();
    });

    test('shows request failures and allows retry', async () => {
        mocks.api
            .mockRejectedValueOnce({ error: { message: 'Access denied' } })
            .mockResolvedValue({ items: [firstDocument], nextOffset: null });
        renderPage();

        expect(
            await screen.findByText('Unable to load documents'),
        ).toBeInTheDocument();
        expect(screen.getByText('Access denied')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(
            await screen.findByRole('link', { name: 'Weekly review' }),
        ).toBeInTheDocument();
    });

    test('follows the server pagination offset and supports returning to the first page', async () => {
        mocks.api.mockImplementation(({ url }: { url: string }) =>
            Promise.resolve(
                url.endsWith('offset=50')
                    ? {
                          items: [
                              {
                                  ...firstDocument,
                                  documentUuid: 'second',
                                  name: 'Monthly review',
                              },
                          ],
                          nextOffset: null,
                      }
                    : { items: [firstDocument], nextOffset: 50 },
            ),
        );
        renderPage();

        expect(
            await screen.findByRole('link', { name: 'Weekly review' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(
            await screen.findByRole('link', { name: 'Monthly review' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Weekly review' }),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
        expect(mocks.api).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project-uuid/documents?limit=50&offset=50',
            }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
        expect(
            await screen.findByRole('link', { name: 'Weekly review' }),
        ).toBeInTheDocument();
    });
});
