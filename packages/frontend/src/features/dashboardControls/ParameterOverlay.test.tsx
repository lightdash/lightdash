import {
    DashboardTileTypes,
    type DashboardParameterControl,
    type DashboardTile,
} from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import type * as LazySelectModule from './LazySelect';
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
    useControlsSidebarSelector: (
        selector: (value: Record<string, unknown>) => unknown,
    ) => selector(mockSidebar.current),
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

const renderCounts = vi.hoisted(() => ({
    current: {} as Record<string, number>,
}));
// Passes through, counting how often each tile's card renders
vi.mock('./LazySelect', async (importOriginal) => {
    const actual = await importOriginal<typeof LazySelectModule>();
    return {
        LazySelect: (props: ComponentProps<typeof actual.LazySelect>) => {
            // Every card has the same label here, so cards are told apart by value
            const key = `${props.value}|${props.data.length}`;
            renderCounts.current[key] = (renderCounts.current[key] ?? 0) + 1;
            return <actual.LazySelect {...props} />;
        },
    };
});

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
        selector: 'button, input',
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

// Option tests keep one tile on the tab
const onlyTile = (only: DashboardTile) => {
    mockDashboardContext.current = {
        ...mockDashboardContext.current,
        dashboardTiles: [only],
    };
};

describe('ParameterOverlays', () => {
    beforeEach(() => {
        updateControl.mockClear();
        renderCounts.current = {};
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
        expect(select(single.uuid)).toHaveTextContent('Start date');
    });

    it('keeps the real select out of the DOM until the trigger is used', async () => {
        renderWithProviders(<ParameterOverlays />);

        const trigger = select(single.uuid);
        expect(trigger.tagName).toBe('BUTTON');
        expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
        expect(
            screen.queryByRole('option', { hidden: true }),
        ).not.toBeInTheDocument();

        trigger.focus();
        await userEvent.keyboard('{ArrowDown}');

        const opened = select(single.uuid);
        expect(opened.tagName).toBe('INPUT');
        expect(opened).toHaveValue('Start date');
        expect(opened).toHaveFocus();
        expect(opened).toHaveAttribute('aria-expanded', 'true');
        expect(optionLabels()).toEqual(['Start date', 'Not set']);
        expect(select(both.uuid).tagName).toBe('BUTTON');
    });

    it('marks every tile the control sets while no parameter is active', () => {
        setSidebar({ editingControl: control({ [both.uuid]: false }) });
        renderWithProviders(<ParameterOverlays />);

        expect(overlay(single.uuid)).toHaveAttribute(
            'data-highlighted',
            'reached',
        );
        // Uses the parameters, but switched off
        expect(overlay(both.uuid)).not.toHaveAttribute('data-highlighted');
        expect(overlay(unreferenced.uuid)).not.toHaveAttribute(
            'data-highlighted',
        );
    });

    it('re-renders only the tiles whose highlight changes with the active parameter', () => {
        // single: value "start" of 2 options; both: "__all__" of 4
        const renders = () => ({
            single: renderCounts.current['start|2'] ?? 0,
            both: renderCounts.current['__all__|4'] ?? 0,
        });
        setSidebar({ activeFieldId: 'end' });
        const { rerender } = renderWithProviders(<ParameterOverlays />);
        expect(renders()).toEqual({ single: 1, both: 1 });

        // A parameter neither tile uses
        setSidebar({ activeFieldId: 'other' });
        rerender(<ParameterOverlays />);
        expect(overlay(both.uuid)).not.toHaveAttribute('data-highlighted');
        expect(renders()).toEqual({ single: 1, both: 2 });

        // No active parameter: both go to "reached", so both render
        setSidebar();
        rerender(<ParameterOverlays />);
        expect(renders()).toEqual({ single: 2, both: 3 });
    });

    it('re-renders only the tile whose mapping changes', async () => {
        const { rerender } = renderWithProviders(<ParameterOverlays />);
        expect(renderCounts.current).toEqual({ 'start|2': 1, '__all__|4': 1 });

        const narrowed = control({ [both.uuid]: 'end' });
        setSidebar({ editingControl: narrowed });
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            parameterControls: [narrowed],
        };
        rerender(<ParameterOverlays />);

        expect(renderCounts.current).toEqual({
            'start|2': 1,
            '__all__|4': 1,
            'end|4': 1,
        });

        // The handler is one stable function, yet it writes onto the latest control
        await userEvent.click(select(single.uuid));
        await chooseOption('Not set');
        expect(updateControl.mock.calls[0][0].tileTargets).toEqual({
            [both.uuid]: 'end',
            [single.uuid]: false,
        });
    });

    it('only covers the tiles on the active tab', () => {
        renderWithProviders(<ParameterOverlays />);

        expect(overlay(both.uuid)).not.toBeNull();
        expect(overlay(otherTab.uuid)).toBeNull();
    });

    it('buckets the overlays by tile order for the arrival wave', () => {
        renderWithProviders(<ParameterOverlays />);

        expect(overlay(single.uuid)).toHaveAttribute('data-wave', '0');
        expect(overlay(both.uuid)).toHaveAttribute('data-wave', '1');
        expect(overlay(unreferenced.uuid)).toHaveAttribute('data-wave', '2');
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
        expect(select(single.uuid)).toHaveTextContent('Not set');
        await userEvent.click(select(single.uuid));
        await chooseOption('Start date');

        expect(updateControl.mock.calls[0][0].tileTargets).toEqual({});
    });

    it('offers "All its parameters" on a two-parameter tile and narrows to a key', async () => {
        onlyTile(both);
        renderWithProviders(<ParameterOverlays />);

        expect(select(both.uuid)).toHaveTextContent('All its parameters');
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
            within(container(unreferenced.uuid)).queryByRole('button'),
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
