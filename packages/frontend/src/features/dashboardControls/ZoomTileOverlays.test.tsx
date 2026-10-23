import {
    DashboardTileTypes,
    DateGranularity,
    type DashboardTile,
    type DateZoomConfig,
} from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { TileOverlays } from './TileOverlay';

const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockContainers = vi.hoisted(() => ({
    current: {} as Record<string, Element>,
}));

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebar: () => mockSidebar.current,
    useControlsSidebarSelector: (
        selector: (value: Record<string, unknown>) => unknown,
    ) => selector(mockSidebar.current),
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector({})),
}));
vi.mock('./usePortalTargets', () => ({
    usePortalTargets: (keys: string[], _: unknown, enabled: boolean) =>
        enabled
            ? Object.fromEntries(
                  keys.map((key) => [key, mockContainers.current[key]]),
              )
            : {},
}));

const tile = (
    uuid: string,
    type: DashboardTileTypes = DashboardTileTypes.SAVED_CHART,
) =>
    ({
        uuid,
        tabUuid: 'tab-1',
        type,
        properties: { title: `Title ${uuid}` },
    }) as DashboardTile;

const chart = tile('chart');
const param = tile('param');
const taken = tile('taken');
const markdown = tile('markdown', DashboardTileTypes.MARKDOWN);
const tiles = [chart, param, taken, markdown];

const ORDER_DATE = {
    fieldId: 'orders_date',
    label: 'Order date',
    tableName: 'orders',
};
const SHIP_DATE = {
    fieldId: 'orders_ship',
    label: 'Ship date',
    tableName: 'orders',
};

const config: DateZoomConfig = {
    controls: [
        { uuid: 'z1', name: 'Order trend', granularity: DateGranularity.MONTH },
        { uuid: 'z2', name: 'Ship trend', granularity: DateGranularity.WEEK },
    ],
    tileTargets: {
        taken: {
            controlUuid: 'z2',
            fieldId: 'orders_ship',
            tableName: 'orders',
        },
    },
};

const updateDateZoomConfig = vi.fn();

const renderOverlays = (zoomConfig: DateZoomConfig = config): void => {
    const store = seedDashboardEditState(
        createDashboardTestStore({
            chartZoomableFieldsByTileUuid: {
                chart: [ORDER_DATE, SHIP_DATE],
                taken: [SHIP_DATE],
            },
            tileParameterReferences: { param: ['date_zoom'] },
        }),
        { dashboardTiles: tiles, dateZoomConfig: zoomConfig },
    );
    const ui: ReactElement = (
        <DashboardStoreTestProvider store={store}>
            <TileOverlays />
        </DashboardStoreTestProvider>
    );
    renderWithAppProviders(ui);
};

const card = (tileUuid: string) =>
    within(mockContainers.current[tileUuid] as HTMLElement);
const overlay = (tileUuid: string) =>
    mockContainers.current[tileUuid].firstElementChild as HTMLElement;

describe('TileOverlays for a date zoom', () => {
    beforeEach(() => {
        updateDateZoomConfig.mockClear();
        document.body.innerHTML = '';
        mockContainers.current = Object.fromEntries(
            tiles.map((t) => {
                const element = document.createElement('div');
                element.setAttribute('data-tile-uuid', t.uuid);
                document.body.appendChild(element);
                return [t.uuid, element];
            }),
        );
        mockSidebar.current = {
            editing: { kind: 'dateZoom', controlUuid: 'z1' },
            editingRule: null,
            editingZoom: config.controls[0],
            hoveredFilterId: null,
            updateDateZoomConfig,
        };
    });

    it('gives a chart tile a select of its own date fields', () => {
        renderOverlays();
        expect(
            card('chart').getByText('This tile is not zoomed'),
        ).toBeVisible();
        expect(overlay('chart')).toHaveAttribute(
            'data-highlighted',
            'available',
        );
        fireEvent.click(
            card('chart').getByRole('button', {
                name: 'Order trend on Title chart',
            }),
        );
        fireEvent.click(screen.getByRole('option', { name: 'Ship date' }));
        expect(updateDateZoomConfig).toHaveBeenCalledWith({
            ...config,
            tileTargets: {
                ...config.tileTargets,
                chart: {
                    controlUuid: 'z1',
                    fieldId: 'orders_ship',
                    tableName: 'orders',
                },
            },
        });
    });

    it('shows the field a tile is zoomed on and clears it', () => {
        const zoomed = {
            ...config,
            tileTargets: {
                ...config.tileTargets,
                chart: {
                    controlUuid: 'z1',
                    fieldId: 'orders_date',
                    tableName: 'orders',
                },
            },
        };
        renderOverlays(zoomed);
        expect(card('chart').getByText('This tile is zoomed on')).toBeVisible();
        expect(overlay('chart')).toHaveAttribute(
            'data-highlighted',
            'filtered',
        );
        fireEvent.click(
            card('chart').getByRole('button', {
                name: 'Stop zooming this tile',
            }),
        );
        expect(updateDateZoomConfig).toHaveBeenCalledWith(config);
    });

    it('gives a param-only tile the on and off switch', () => {
        renderOverlays();
        const toggle = card('param').getByRole('switch', {
            name: 'Order trend on Title param',
        });
        expect(toggle).not.toBeChecked();
        fireEvent.click(toggle);
        expect(updateDateZoomConfig).toHaveBeenCalledWith({
            ...config,
            tileTargets: {
                ...config.tileTargets,
                param: { controlUuid: 'z1', fieldId: null, tableName: null },
            },
        });
    });

    it('veils a tile with no date to zoom, with no card', () => {
        renderOverlays();
        expect(overlay('markdown')).toHaveAttribute(
            'title',
            'No date field to zoom',
        );
        expect(card('markdown').queryByRole('button')).toBeNull();
    });

    it('shows a tile in another zoom read-only, warns it would empty it and moves it here', () => {
        renderOverlays();
        expect(card('taken').getByText('Ship trend')).toBeVisible();
        expect(card('taken').getByText('Ship date · Week')).toBeVisible();
        expect(
            card('taken').getByText('Ship trend will be removed on save'),
        ).toBeVisible();
        expect(card('taken').queryByRole('switch')).toBeNull();

        fireEvent.click(
            card('taken').getByRole('button', { name: 'Move here' }),
        );
        expect(updateDateZoomConfig).toHaveBeenCalledWith({
            ...config,
            tileTargets: {
                taken: {
                    controlUuid: 'z1',
                    fieldId: 'orders_ship',
                    tableName: 'orders',
                },
            },
        });
    });

    it('does not warn when the other zoom keeps a tile', () => {
        renderOverlays({
            ...config,
            tileTargets: {
                ...config.tileTargets,
                param: { controlUuid: 'z2', fieldId: null, tableName: null },
            },
        });
        expect(
            card('taken').queryByText('Ship trend will be removed on save'),
        ).toBeNull();
        expect(card('param').getByText('Parameter · Week')).toBeVisible();
    });

    it("rings a hovered zoom row's tiles while nothing is edited", () => {
        mockSidebar.current = {
            editing: null,
            editingRule: null,
            editingZoom: null,
            hoveredFilterId: 'z2',
            updateDateZoomConfig,
        };
        renderOverlays();
        expect(
            mockContainers.current.taken.querySelector('[aria-hidden]'),
        ).not.toBeNull();
        expect(mockContainers.current.chart.childElementCount).toBe(0);
    });
});
