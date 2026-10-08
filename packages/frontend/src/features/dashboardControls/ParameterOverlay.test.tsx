import {
    DashboardTileTypes,
    type DashboardParameterControl,
    type DashboardTile,
} from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { ParameterOverlays } from './ParameterOverlay';

const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockContainers = vi.hoisted(() => ({
    current: {} as Record<string, Element>,
}));

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebar: () => mockSidebar.current,
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
vi.mock('./usePortalTargets', () => ({
    usePortalTargets: (keys: string[], _: unknown, enabled: boolean) =>
        enabled
            ? Object.fromEntries(
                  keys.map((key) => [key, mockContainers.current[key]]),
              )
            : {},
}));

const tile = (uuid: string, tabUuid: string) =>
    ({
        uuid,
        tabUuid,
        type: DashboardTileTypes.SAVED_CHART,
        properties: {},
    }) as DashboardTile;

const single = tile('tile-single', 'tab-1');
const both = tile('tile-both', 'tab-1');
const unreferenced = tile('tile-none', 'tab-1');
const otherTab = tile('tile-other-tab', 'tab-2');
const allTiles = [single, both, unreferenced, otherTab];

const control = (
    tileTargets: DashboardParameterControl['tileTargets'] = {},
): DashboardParameterControl => ({
    id: 'control',
    label: 'Period',
    parameterKeys: ['start', 'end'],
    tileTargets,
});

const updateControl = vi.fn();

const setSidebar = (overrides: Record<string, unknown> = {}) => {
    mockSidebar.current = {
        editingControl: control(),
        activeFieldId: null,
        highlightedFieldId: null,
        updateControl,
        ...overrides,
    };
};

const container = (tileUuid: string) =>
    mockContainers.current[tileUuid] as HTMLElement;
const select = (tileUuid: string) =>
    within(container(tileUuid)).getByLabelText('Period on this tile', {
        selector: 'input',
    });
const lines = (tileUuid: string) =>
    [...container(tileUuid).querySelectorAll('p')].map(
        (line) => line.textContent,
    );
const overlay = (tileUuid: string) =>
    container(tileUuid).firstElementChild as HTMLElement | null;
const optionLabels = () =>
    screen
        .getAllByRole('option', { hidden: true })
        .map((option) => option.textContent);
const chooseOption = (label: string) =>
    userEvent.click(screen.getByRole('option', { name: label, hidden: true }));

// Every select mounts its options, so option tests keep one tile on the tab
const onlyTile = (only: DashboardTile) => {
    mockDashboardContext.current = {
        ...mockDashboardContext.current,
        dashboardTiles: [only],
    };
};

describe('ParameterOverlays', () => {
    beforeEach(() => {
        updateControl.mockClear();
        document.body.innerHTML = '';
        mockContainers.current = Object.fromEntries(
            allTiles.map((t) => {
                const element = document.createElement('div');
                element.setAttribute('data-tile-uuid', t.uuid);
                document.body.appendChild(element);
                return [t.uuid, element];
            }),
        );
        mockDashboardContext.current = {
            dashboardTiles: allTiles,
            activeTab: { uuid: 'tab-1', name: 'One', order: 0 },
            parameterValues: { end: '2026-01-01' },
            parameterControls: [control()],
            parameterDefinitions: {
                start: { label: 'Start date', default: '2025-07-06' },
                end: { label: 'End date' },
            },
            tileParameterReferences: {
                [single.uuid]: ['start'],
                [both.uuid]: ['start', 'end'],
                [unreferenced.uuid]: ['other'],
                [otherTab.uuid]: ['start'],
            },
            tileChartSavedParameters: {},
        };
        setSidebar();
    });

    it('shows the parameter a single-parameter tile is set by, with its value and source', () => {
        renderWithProviders(<ParameterOverlays />);

        expect(lines(single.uuid)).toEqual(['Set by', '2025-07-06 · default']);
        expect(select(single.uuid)).toHaveValue('Start date');
        expect(overlay(single.uuid)).not.toHaveAttribute('data-highlighted');
    });

    it('only covers the tiles on the active tab', () => {
        renderWithProviders(<ParameterOverlays />);

        expect(overlay(both.uuid)).not.toBeNull();
        expect(overlay(otherTab.uuid)).toBeNull();
    });

    it('writes false when "Not set" is chosen', async () => {
        onlyTile(single);
        renderWithProviders(<ParameterOverlays />);

        await userEvent.click(select(single.uuid));
        expect(optionLabels()).toEqual(['Start date', 'Not set']);
        await chooseOption('Not set');

        expect(updateControl).toHaveBeenCalledTimes(1);
        expect(updateControl.mock.calls[0][0].tileTargets).toEqual({
            [single.uuid]: false,
        });
    });

    it('writes no entry when a single-parameter tile is set again', async () => {
        const off = control({ [single.uuid]: false });
        setSidebar({ editingControl: off });
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            parameterControls: [off],
        };
        onlyTile(single);
        renderWithProviders(<ParameterOverlays />);

        expect(lines(single.uuid)[0]).toBe('Not set');
        expect(select(single.uuid)).toHaveValue('Not set');
        await userEvent.click(select(single.uuid));
        await chooseOption('Start date');

        expect(updateControl.mock.calls[0][0].tileTargets).toEqual({});
    });

    it('offers "All its parameters" on a two-parameter tile and narrows to a key', async () => {
        onlyTile(both);
        renderWithProviders(<ParameterOverlays />);

        expect(select(both.uuid)).toHaveValue('All its parameters');
        expect(lines(both.uuid)).toEqual([
            'Set by',
            'Start date: 2025-07-06 · default',
            'End date: 2026-01-01 · this control',
        ]);

        await userEvent.click(select(both.uuid));
        expect(optionLabels()).toEqual([
            'All its parameters',
            'Start date',
            'End date',
            'Not set',
        ]);
        await chooseOption('End date');

        expect(updateControl.mock.calls[0][0].tileTargets).toEqual({
            [both.uuid]: 'end',
        });
    });

    it('reports the chart value or a missing value when the tile is switched off', () => {
        const off = control({ [both.uuid]: false });
        setSidebar({ editingControl: off });
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            parameterControls: [off],
            parameterDefinitions: {
                start: { label: 'Start date' },
                end: { label: 'End date' },
            },
            tileChartSavedParameters: { [both.uuid]: { end: '2024-12-31' } },
        };
        renderWithProviders(<ParameterOverlays />);

        expect(lines(both.uuid)).toEqual([
            'Not set',
            'Start date: needs a value',
            'End date: 2024-12-31 · chart',
        ]);
    });

    it('highlights the tiles set through the active parameter', () => {
        setSidebar({ activeFieldId: 'end' });
        renderWithProviders(<ParameterOverlays />);

        expect(overlay(both.uuid)).toHaveAttribute(
            'data-highlighted',
            'mapped',
        );
        expect(overlay(single.uuid)).not.toHaveAttribute('data-highlighted');
    });

    it('does not highlight a tile narrowed to another parameter', () => {
        setSidebar({
            editingControl: control({ [both.uuid]: 'start' }),
            activeFieldId: 'end',
        });
        renderWithProviders(<ParameterOverlays />);

        expect(overlay(both.uuid)).toHaveAttribute(
            'data-highlighted',
            'available',
        );
    });

    it('veils a tile that uses none of the parameters, with no text', () => {
        renderWithProviders(<ParameterOverlays />);

        expect(lines(unreferenced.uuid)).toEqual([]);
        expect(
            within(container(unreferenced.uuid)).queryByRole('textbox'),
        ).not.toBeInTheDocument();
    });

    it('swallows mouse down and click on the veil', async () => {
        const onPointer = vi.fn();
        renderWithProviders(
            <div onMouseDown={onPointer} onClick={onPointer}>
                <ParameterOverlays />
            </div>,
        );

        await userEvent.click(overlay(unreferenced.uuid)!);
        await userEvent.click(overlay(single.uuid)!);

        expect(onPointer).not.toHaveBeenCalled();
    });

    it('renders nothing when no control is edited', () => {
        setSidebar({ editingControl: null });
        renderWithProviders(<ParameterOverlays />);

        allTiles.forEach((t) => expect(overlay(t.uuid)).toBeNull());
    });
});
