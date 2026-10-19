import {
    ChartKind,
    ContentType,
    contentToResourceViewItem,
    type SummaryContent,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { mockedLightdashApi } from '../../../../testing/mockedLightdashApi';
import { useHomepageFavorites } from '../hooks/useHomepageFavorites';
import { ContentCard } from './ContentCard';
import { RecentList } from './RecentBlock';

const mocks = vi.hoisted(() => ({
    api: vi.fn(),
    errorToast: vi.fn(),
    content: null as SummaryContent | null,
    otherContent: null as SummaryContent | null,
}));
vi.mock('../../../../api');
vi.mock('../../../../hooks/useProjectRoute', () => ({
    useProjectUrlIdentifier: () => 'project',
}));
vi.mock('../../../../hooks/useTimeAgo', () => ({
    useTimeAgo: () => 'just now',
}));
vi.mock('../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: false } }),
}));
vi.mock('../../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: vi.fn(),
        showToastApiError: mocks.errorToast,
    }),
}));
vi.mock('../../../../components/common/ViewsCountPopover', () => ({
    default: ({ children }: PropsWithChildren) => children,
}));
vi.mock('../hooks/useRecentContents', () => ({
    useRecentContents: () => ({
        contents: [mocks.content],
        recents: [{ uuid: mocks.content!.uuid, viewedAt: new Date() }],
        isLoading: false,
    }),
}));

const contentFor = (contentType: ContentType): SummaryContent =>
    ({
        contentType,
        uuid: 'content',
        name: 'Sales',
        slug: 'sales',
        description: null,
        space: { uuid: 'space', name: 'Shared' },
        project: { uuid: 'project', name: 'Project' },
        organization: { uuid: 'org', name: 'Org' },
        createdAt: new Date(),
        createdBy: null,
        lastUpdatedAt: null,
        lastUpdatedBy: null,
        views: 12,
        firstViewedAt: null,
        pinnedList: null,
        verification: null,
        chartKind: ChartKind.VERTICAL_BAR,
        latestVersionNumber: 1,
        latestVersionStatus: 'ready',
        latestReadyVersionNumber: 1,
        template: null,
        directAccessRoles: [],
    }) as SummaryContent;

const HomepageLists = () => {
    const starFor = useHomepageFavorites('project');
    const location = useLocation();
    return (
        <>
            <RecentList projectUuid="project" />
            <ContentCard
                content={mocks.content!}
                projectUuid="project"
                star={starFor(mocks.content!)}
            />
            {mocks.otherContent && (
                <ContentCard
                    content={mocks.otherContent}
                    projectUuid="project"
                    star={starFor(mocks.otherContent)}
                />
            )}
            <output data-testid="location">{location.pathname}</output>
        </>
    );
};

describe('homepage list favorites', () => {
    let client: QueryClient;
    let favorite: boolean;
    let finishToggle: () => void;
    let failToggle: () => void;
    beforeEach(() => {
        client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        favorite = false;
        mocks.otherContent = null;
        mocks.content = contentFor(ContentType.DATA_APP);
        mocks.errorToast.mockClear();
        mockedLightdashApi
            .mockReset()
            .mockImplementation(({ method }: { method: string }) => {
                if (method === 'GET')
                    return Promise.resolve(
                        favorite
                            ? [contentToResourceViewItem(mocks.content!)]
                            : [],
                    );
                return new Promise((resolve, reject) => {
                    finishToggle = () => {
                        favorite = !favorite;
                        resolve({ isFavorite: favorite });
                    };
                    failToggle = () =>
                        reject({
                            error: {
                                message: 'Unavailable',
                                name: 'Error',
                                statusCode: 500,
                            },
                        });
                });
            });
    });
    afterEach(() => client.clear());

    const renderLists = () =>
        render(
            <QueryClientProvider client={client}>
                <MantineProvider env="test">
                    <MemoryRouter initialEntries={['/home']}>
                        <HomepageLists />
                    </MemoryRouter>
                </MantineProvider>
            </QueryClientProvider>,
        );

    it.each([ContentType.CHART, ContentType.DASHBOARD, ContentType.DATA_APP])(
        'toggles %s across both lists without navigation and blocks duplicate pending requests',
        async (type) => {
            mocks.content = contentFor(type);
            renderLists();
            await waitFor(() =>
                expect(
                    screen.getAllByRole('button', {
                        name: 'Add Sales to favorites',
                    })[0],
                ).toBeEnabled(),
            );
            fireEvent.click(
                screen.getAllByRole('button', {
                    name: 'Add Sales to favorites',
                })[0],
            );
            await waitFor(() =>
                expect(
                    screen.getAllByRole('button', {
                        name: 'Add Sales to favorites',
                    })[1],
                ).toBeDisabled(),
            );
            fireEvent.click(
                screen.getAllByRole('button', {
                    name: 'Add Sales to favorites',
                })[1],
            );
            expect(
                mockedLightdashApi.mock.calls.filter(
                    ([request]) => request.method === 'PATCH',
                ),
            ).toHaveLength(1);
            expect(mockedLightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'PATCH',
                    body: JSON.stringify({
                        contentType: type,
                        contentUuid: 'content',
                    }),
                }),
            );
            await act(async () => finishToggle());
            await waitFor(() =>
                expect(
                    screen.getAllByRole('button', {
                        name: 'Remove Sales from favorites',
                    }),
                ).toHaveLength(2),
            );
            expect(client.getQueryData(['favorites', 'project'])).toHaveLength(
                1,
            );
            fireEvent.click(
                screen.getAllByRole('button', {
                    name: 'Remove Sales from favorites',
                })[1],
            );
            await waitFor(() =>
                expect(
                    mockedLightdashApi.mock.calls.filter(
                        ([request]) => request.method === 'PATCH',
                    ),
                ).toHaveLength(2),
            );
            await act(async () => finishToggle());
            await waitFor(() =>
                expect(
                    screen.getAllByRole('button', {
                        name: 'Add Sales to favorites',
                    }),
                ).toHaveLength(2),
            );
            expect(screen.getByTestId('location')).toHaveTextContent('/home');
        },
    );

    it('keeps the current favorite state after failure and re-enables the controls', async () => {
        favorite = true;
        renderLists();
        await waitFor(() =>
            expect(
                screen.getAllByRole('button', {
                    name: 'Remove Sales from favorites',
                })[0],
            ).toBeEnabled(),
        );
        fireEvent.click(
            screen.getAllByRole('button', {
                name: 'Remove Sales from favorites',
            })[0],
        );
        await waitFor(() =>
            expect(
                screen.getAllByRole('button', {
                    name: 'Remove Sales from favorites',
                })[1],
            ).toBeDisabled(),
        );
        await act(async () => failToggle());
        await waitFor(() =>
            expect(
                screen.getAllByRole('button', {
                    name: 'Remove Sales from favorites',
                })[0],
            ).toBeEnabled(),
        );
        expect(mocks.errorToast).toHaveBeenCalled();
        expect(client.getQueryData(['favorites', 'project'])).toHaveLength(1);
        expect(screen.getByTestId('location')).toHaveTextContent('/home');
    });

    it('keeps unrelated favorites usable while one item waits for its refresh', async () => {
        mocks.otherContent = {
            ...contentFor(ContentType.CHART),
            uuid: 'other',
            name: 'Other',
        };
        const favorites = [
            contentToResourceViewItem(mocks.content!),
            contentToResourceViewItem(mocks.otherContent),
        ];
        let finishRefresh: () => void = () => {};
        let finishOther: () => void = () => {};
        mockedLightdashApi.mockImplementation(({ method, body }) => {
            if (method === 'GET') return Promise.resolve(favorites);
            return new Promise((resolve) => {
                const finish = () => resolve({ isFavorite: false });
                if (JSON.parse(body).contentUuid === 'other')
                    finishOther = finish;
                else finishToggle = finish;
            });
        });
        renderLists();
        const sales = await screen.findAllByRole('button', {
            name: 'Remove Sales from favorites',
        });
        const other = screen.getByRole('button', {
            name: 'Remove Other from favorites',
        });
        fireEvent.click(sales[0]);
        // A second occurrence is blocked even before React paints disabled state.
        fireEvent.click(sales[1]);
        await waitFor(() => expect(sales[1]).toBeDisabled());
        expect(other).toBeEnabled();
        expect(sales[0]).toHaveAccessibleName('Remove Sales from favorites');
        expect(
            sales[0].querySelector('.tabler-icon-star-filled'),
        ).not.toBeNull();
        expect(other.querySelector('.tabler-icon-star-filled')).not.toBeNull();
        expect(
            mockedLightdashApi.mock.calls.filter(([r]) => r.method === 'PATCH'),
        ).toHaveLength(1);

        // A slow background GET must keep the item pending and old stars visible.
        mockedLightdashApi.mockImplementation(({ method }) => {
            if (method === 'GET')
                return new Promise((resolve) => {
                    finishRefresh = () =>
                        resolve([
                            contentToResourceViewItem(mocks.otherContent!),
                        ]);
                });
            return new Promise((resolve) => {
                finishOther = () => resolve({ isFavorite: false });
            });
        });
        await act(async () => finishToggle());
        expect(sales[0]).toBeDisabled();
        expect(other).toBeEnabled();
        expect(sales[0]).toHaveAccessibleName('Remove Sales from favorites');
        fireEvent.click(other);
        await waitFor(() => expect(other).toBeDisabled());
        expect(
            mockedLightdashApi.mock.calls.filter(([r]) => r.method === 'PATCH'),
        ).toHaveLength(2);
        await act(async () => finishRefresh());
        await waitFor(() => expect(sales[0]).toBeEnabled());
        expect(sales[0]).toHaveAccessibleName('Add Sales to favorites');
        expect(other).toBeDisabled();
        expect(other).toHaveAccessibleName('Remove Other from favorites');
        mockedLightdashApi.mockImplementation(() => Promise.resolve([]));
        await act(async () => finishOther());
        await waitFor(() => expect(other).toBeEnabled());
        expect(other).toHaveAccessibleName('Add Other to favorites');
        expect(screen.getByTestId('location')).toHaveTextContent('/home');
    });

    it('does not offer a favorite action for a personal app', () => {
        mocks.content = {
            ...contentFor(ContentType.DATA_APP),
            space: null,
        } as SummaryContent;
        renderLists();
        expect(
            screen.queryByRole('button', { name: /favorites/ }),
        ).not.toBeInTheDocument();
    });
});
