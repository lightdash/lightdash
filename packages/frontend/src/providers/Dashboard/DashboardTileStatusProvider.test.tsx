import {
    DashboardTileTypes,
    type DashboardDataAppTile,
    type DashboardTab,
} from '@lightdash/common';
import { act, cleanup, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DashboardTileStatusProvider, {
    type DashboardTileStatusProviderProps,
} from './DashboardTileStatusProvider';
import useDashboardTileStatusContext from './useDashboardTileStatusContext';

vi.mock('./useDashboardContext', () => ({
    default: (selector: (context: Record<string, unknown>) => unknown) =>
        selector({ projectUuid: 'project-uuid' }),
}));
vi.mock('../App/useApp', () => ({
    default: () => ({ health: { data: undefined } }),
}));
vi.mock('../../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ embedToken: undefined }),
}));
vi.mock('../../ee/features/embed/hooks/useEmbedEventEmitter', () => ({
    useEmbedEventEmitter: () => ({
        dispatchEmbedEvent: vi.fn(),
        isEmbedEventReady: false,
    }),
}));
vi.mock('../../hooks/dashboard/useDashboardPreAggregateAudit', () => ({
    useDashboardPreAggregateAudit: () => ({ data: undefined }),
}));

const tabs: DashboardTab[] = [
    { uuid: 'first-tab', name: 'First', order: 0 },
    { uuid: 'second-tab', name: 'Second', order: 1 },
];

const appTile = (
    uuid: string,
    tabUuid: string | null = null,
): DashboardDataAppTile => ({
    uuid,
    type: DashboardTileTypes.DATA_APP,
    x: 0,
    y: 0,
    w: 12,
    h: 6,
    tabUuid,
    properties: { title: uuid, appUuid: `app-${uuid}` },
});

const renderStatus = (
    props: Omit<DashboardTileStatusProviderProps, 'children'>,
    path = '/minimal/dashboard/dashboard-uuid',
) =>
    renderHook(() => useDashboardTileStatusContext((context) => context), {
        wrapper: ({ children }: { children: ReactNode }) => (
            <MemoryRouter initialEntries={[path]}>
                <DashboardTileStatusProvider {...props}>
                    {children}
                </DashboardTileStatusProvider>
            </MemoryRouter>
        ),
    });

afterEach(cleanup);

describe('dashboard screenshots with data app tiles', () => {
    it.each(['ready', 'error'])(
        'clears a previous %s state when an app reloads',
        (state) => {
            const { result } = renderStatus({
                dashboardTiles: [appTile('app')],
                dashboardTabs: [],
                activeTab: undefined,
            });

            act(() => {
                if (state === 'ready') {
                    result.current.markTileScreenshotReady('app');
                } else {
                    result.current.markTileScreenshotErrored('app');
                }
            });
            expect(result.current.isReadyForScreenshot).toBe(true);
            act(() => result.current.markTileScreenshotLoading('app'));
            expect(result.current.isReadyForScreenshot).toBe(false);
            expect(result.current.screenshotReadyTilesCount).toBe(0);
            expect(result.current.screenshotErroredTilesCount).toBe(0);
        },
    );

    it('still waits for saved and SQL charts without waiting for markdown', () => {
        const { result } = renderStatus({
            dashboardTiles: [
                {
                    ...appTile('chart'),
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: { savedChartUuid: 'saved' },
                },
                {
                    ...appTile('sql'),
                    type: DashboardTileTypes.SQL_CHART,
                    properties: { savedSqlUuid: 'sql', chartName: 'SQL' },
                },
                {
                    ...appTile('markdown'),
                    type: DashboardTileTypes.MARKDOWN,
                    properties: { title: 'Text', content: 'Note' },
                },
            ],
            dashboardTabs: [],
            activeTab: undefined,
        });

        expect(result.current.isReadyForScreenshot).toBe(false);
        act(() => result.current.markTileScreenshotReady('chart'));
        expect(result.current.isReadyForScreenshot).toBe(false);
        act(() => result.current.markTileScreenshotErrored('sql'));
        expect(result.current.isReadyForScreenshot).toBe(true);
        expect(result.current.expectedScreenshotTilesCount).toBe(2);
    });

    it('waits for the app on a dashboard containing only a data app tile', () => {
        const { result } = renderStatus({
            dashboardTiles: [appTile('only-app')],
            dashboardTabs: [],
            activeTab: undefined,
        });

        expect(result.current.isReadyForScreenshot).toBe(false);
        act(() => result.current.markTileScreenshotReady('only-app'));
        expect(result.current.isReadyForScreenshot).toBe(true);
    });

    it('waits for every data app to finish', () => {
        const { result } = renderStatus({
            dashboardTiles: [appTile('fast-app'), appTile('slow-app')],
            dashboardTabs: [],
            activeTab: undefined,
        });

        act(() => result.current.markTileScreenshotReady('fast-app'));
        expect(result.current.isReadyForScreenshot).toBe(false);
        act(() => result.current.markTileScreenshotReady('slow-app'));
        expect(result.current.isReadyForScreenshot).toBe(true);
    });

    it('allows a terminal app error to complete the screenshot', () => {
        const { result } = renderStatus({
            dashboardTiles: [appTile('failed-app')],
            dashboardTabs: [],
            activeTab: undefined,
        });

        expect(result.current.isReadyForScreenshot).toBe(false);
        act(() => result.current.markTileScreenshotErrored('failed-app'));
        expect(result.current.isReadyForScreenshot).toBe(true);
        expect(result.current.screenshotErroredTilesCount).toBe(1);
    });

    it.each([
        { name: 'active tab', selected: undefined, paged: false },
        {
            name: 'stacked selected tabs',
            selected: ['first-tab', null],
            paged: false,
        },
        { name: 'paged selected tabs', selected: ['first-tab'], paged: true },
    ])('waits only for rendered apps in $name', ({ selected, paged }) => {
        const { result } = renderStatus(
            {
                dashboardTiles: [
                    appTile('visible-app', 'first-tab'),
                    appTile('other-tab-app', 'second-tab'),
                    appTile('orphan-app'),
                ],
                dashboardTabs: tabs,
                activeTab: tabs[0],
                schedulerTabsSelected: selected,
            },
            `/minimal/dashboard/dashboard-uuid?exportPagedTabs=${paged}`,
        );

        act(() => result.current.markTileScreenshotReady('visible-app'));
        expect(result.current.isReadyForScreenshot).toBe(false);
        act(() => result.current.markTileScreenshotReady('orphan-app'));
        expect(result.current.isReadyForScreenshot).toBe(true);
        expect(result.current.expectedScreenshotTilesCount).toBe(2);
    });
});
