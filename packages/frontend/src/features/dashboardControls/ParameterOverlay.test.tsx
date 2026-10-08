import {
    DashboardTileTypes,
    type DashboardParameterControl,
    type DashboardTile,
} from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
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
            const key = `${props.value}|${props.groups[0].items.length}`;
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
const clearButton = (tileUuid: string) =>
    within(container(tileUuid)).queryByRole('button', {
        name: 'Switch this tile off',
    });
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

    it('names the select of an unlabelled control after its first parameter', () => {
        setSidebar({ editingControl: { ...control(), label: '' } });
        renderWithProviders(<ParameterOverlays />);

        expect(
            within(container(single.uuid)).getByLabelText(
                'Start date on this tile',
                { selector: 'button, input' },
            ),
        ).toBeInTheDocument();
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
        expect(optionLabels()).toEqual(['Start date']);
        expect(select(both.uuid).tagName).toBe('BUTTON');
    });

    it('marks set tiles as mapped and the ones that could be as available while no parameter is active', () => {
        setSidebar({ editingControl: control({ [both.uuid]: false }) });
        renderWithProviders(<ParameterOverlays />);

        expect(overlay(single.uuid)).toHaveAttribute(
            'data-highlighted',
            'mapped',
        );
        // Uses the parameters, but switched off
        expect(overlay(both.uuid)).toHaveAttribute(
            'data-highlighted',
            'available',
        );
        expect(overlay(unreferenced.uuid)).not.toHaveAttribute(
            'data-highlighted',
        );
    });

    it('re-renders only the tiles whose highlight changes with the active parameter', () => {
        // single: value "start" of 1 option; both: "__all__" of 3
        const renders = () => ({
            single: renderCounts.current['start|1'] ?? 0,
            both: renderCounts.current['__all__|3'] ?? 0,
        });
        // No active parameter: both are set, so both are mapped
        const { rerender } = renderWithProviders(<ParameterOverlays />);
        expect(renders()).toEqual({ single: 1, both: 1 });

        // A parameter only "both" is set through: it stays mapped, "single"
        // is set through another one
        setSidebar({ activeFieldId: 'end' });
        rerender(<ParameterOverlays />);
        expect(overlay(both.uuid)).toHaveAttribute(
            'data-highlighted',
            'mapped',
        );
        expect(overlay(single.uuid)).toHaveAttribute(
            'data-highlighted',
            'other',
        );
        expect(renders()).toEqual({ single: 2, both: 1 });

        // A parameter neither tile is set through: "both" changes, "single"
        // does not
        setSidebar({ activeFieldId: 'other' });
        rerender(<ParameterOverlays />);
        expect(overlay(both.uuid)).toHaveAttribute('data-highlighted', 'other');
        expect(overlay(single.uuid)).toHaveAttribute(
            'data-highlighted',
            'other',
        );
        expect(renders()).toEqual({ single: 2, both: 2 });

        // No active parameter again: both go back to mapped, so both render
        setSidebar();
        rerender(<ParameterOverlays />);
        expect(renders()).toEqual({ single: 3, both: 3 });
    });

    it('never re-renders a tile that is not set when the active parameter changes', () => {
        // Both switched off: no value of 1 option, no value of 3
        const editingControl = control({
            [single.uuid]: false,
            [both.uuid]: false,
        });
        setSidebar({ editingControl });
        const { rerender } = renderWithProviders(<ParameterOverlays />);
        expect(renderCounts.current).toEqual({ 'null|1': 1, 'null|3': 1 });

        setSidebar({ editingControl, activeFieldId: 'end' });
        rerender(<ParameterOverlays />);
        setSidebar({ editingControl, activeFieldId: 'start' });
        rerender(<ParameterOverlays />);
        setSidebar({ editingControl });
        rerender(<ParameterOverlays />);

        expect(renderCounts.current).toEqual({ 'null|1': 1, 'null|3': 1 });
    });

    it('re-renders only the tile whose mapping changes', async () => {
        const { rerender } = renderWithProviders(<ParameterOverlays />);
        expect(renderCounts.current).toEqual({ 'start|1': 1, '__all__|3': 1 });

        const narrowed = control({ [both.uuid]: 'end' });
        setSidebar({ editingControl: narrowed });
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            parameterControls: [narrowed],
        };
        rerender(<ParameterOverlays />);

        expect(renderCounts.current).toEqual({
            'start|1': 1,
            '__all__|3': 1,
            'end|3': 1,
        });

        // The handler is one stable function, yet it writes onto the latest control
        await userEvent.click(clearButton(single.uuid)!);
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

    it('writes false when the select is cleared, without opening the list', async () => {
        onlyTile(single);
        renderWithProviders(<ParameterOverlays />);

        await userEvent.click(clearButton(single.uuid)!);

        expect(updateControl).toHaveBeenCalledTimes(1);
        expect(updateControl.mock.calls[0][0].tileTargets).toEqual({
            [single.uuid]: false,
        });
        expect(select(single.uuid).tagName).toBe('BUTTON');
    });

    it('writes false when the opened select is cleared, with no "Not set" option', async () => {
        onlyTile(both);
        renderWithProviders(<ParameterOverlays />);

        await userEvent.click(select(both.uuid));
        expect(optionLabels()).not.toContain('Not set');
        await userEvent.click(clearButton(both.uuid)!);

        expect(updateControl).toHaveBeenCalledTimes(1);
        expect(updateControl.mock.calls[0][0].tileTargets).toEqual({
            [both.uuid]: false,
        });
    });

    it('writes no entry when "All its parameters" is chosen on a narrowed tile', async () => {
        const narrowed = control({ [both.uuid]: 'end' });
        setSidebar({ editingControl: narrowed });
        onlyTile(both);
        renderWithProviders(<ParameterOverlays />);

        expect(select(both.uuid)).toHaveTextContent('End date');
        await userEvent.click(select(both.uuid));
        await chooseOption('All its parameters');

        expect(updateControl.mock.calls[0][0].tileTargets).toEqual({});
    });

    it('shows the placeholder on a tile narrowed to a parameter it does not use', () => {
        setSidebar({ editingControl: control({ [single.uuid]: 'end' }) });
        onlyTile(single);
        renderWithProviders(<ParameterOverlays />);

        expect(lines(single.uuid)[0]).toBe('Not set');
        expect(select(single.uuid)).toHaveTextContent('Select a parameter');
        expect(overlay(single.uuid)).toHaveAttribute(
            'data-highlighted',
            'available',
        );
    });

    it('never scrolls while no parameter is clicked, though the tiles are marked', () => {
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;

        const { rerender } = renderWithProviders(<ParameterOverlays />);
        expect(overlay(single.uuid)).toHaveAttribute(
            'data-highlighted',
            'mapped',
        );
        setSidebar({ activeFieldId: 'end' });
        rerender(<ParameterOverlays />);
        expect(scrollIntoView).not.toHaveBeenCalled();

        // The first tile in the grid is marked too, but for another parameter
        setSidebar({ activeFieldId: 'end', highlightedFieldId: 'end' });
        rerender(<ParameterOverlays />);
        expect(overlay(single.uuid)).toHaveAttribute(
            'data-highlighted',
            'other',
        );
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(scrollIntoView.mock.instances[0]).toBe(overlay(both.uuid));
    });

    it('does not scroll when the clicked parameter is set on no tile', () => {
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;

        setSidebar({
            editingControl: control({ [both.uuid]: 'start' }),
            activeFieldId: 'end',
            highlightedFieldId: 'end',
        });
        renderWithProviders(<ParameterOverlays />);

        expect(overlay(single.uuid)).toHaveAttribute(
            'data-highlighted',
            'other',
        );
        expect(overlay(both.uuid)).toHaveAttribute('data-highlighted', 'other');
        expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('does not scroll while another parameter is hovered over the clicked one', () => {
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;

        setSidebar({ activeFieldId: 'start', highlightedFieldId: 'end' });
        renderWithProviders(<ParameterOverlays />);

        expect(overlay(single.uuid)).toHaveAttribute(
            'data-highlighted',
            'mapped',
        );
        expect(scrollIntoView).not.toHaveBeenCalled();
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
        expect(select(single.uuid)).toHaveTextContent('Select a parameter');
        expect(clearButton(single.uuid)).not.toBeInTheDocument();
        await userEvent.click(select(single.uuid));
        expect(select(single.uuid)).toHaveAttribute(
            'placeholder',
            'Select a parameter',
        );
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

    it('marks the tiles set through the active parameter as mapped', () => {
        setSidebar({ activeFieldId: 'end' });
        renderWithProviders(<ParameterOverlays />);

        expect(overlay(both.uuid)).toHaveAttribute(
            'data-highlighted',
            'mapped',
        );
        expect(overlay(unreferenced.uuid)).not.toHaveAttribute(
            'data-highlighted',
        );
    });

    it('marks a tile set through another parameter as other, whether or not it uses the active one', () => {
        setSidebar({
            editingControl: control({ [both.uuid]: 'start' }),
            activeFieldId: 'end',
        });
        renderWithProviders(<ParameterOverlays />);

        // Uses "end", narrowed to "start"
        expect(overlay(both.uuid)).toHaveAttribute('data-highlighted', 'other');
        // Does not use "end"
        expect(overlay(single.uuid)).toHaveAttribute(
            'data-highlighted',
            'other',
        );
    });

    it('keeps a tile that is not set available, whether or not it uses the active parameter', () => {
        setSidebar({
            editingControl: control({
                [single.uuid]: false,
                [both.uuid]: false,
            }),
            activeFieldId: 'end',
        });
        renderWithProviders(<ParameterOverlays />);

        // Uses "end"
        expect(overlay(both.uuid)).toHaveAttribute(
            'data-highlighted',
            'available',
        );
        // Does not
        expect(overlay(single.uuid)).toHaveAttribute(
            'data-highlighted',
            'available',
        );
        expect(overlay(unreferenced.uuid)).not.toHaveAttribute(
            'data-highlighted',
        );
    });

    it('veils a tile that uses none of the parameters, with no text', () => {
        renderWithProviders(<ParameterOverlays />);

        expect(lines(unreferenced.uuid)).toEqual([]);
        expect(
            within(container(unreferenced.uuid)).queryByRole('button'),
        ).not.toBeInTheDocument();
    });

    it('marks every veil for the grid and lets a mouse down reach the document', () => {
        const onMouseDown = vi.fn();
        document.addEventListener('mousedown', onMouseDown);
        renderWithProviders(<ParameterOverlays />);

        // The grid's draggableCancel selector
        expect(overlay(unreferenced.uuid)).toHaveClass('non-draggable');
        expect(overlay(single.uuid)).toHaveClass('non-draggable');
        expect(overlay(single.uuid)).toHaveAttribute('data-controls-overlay');
        expect(
            overlay(single.uuid)!.querySelector('[data-keeps-field]'),
        ).not.toBeNull();

        fireEvent.mouseDown(overlay(unreferenced.uuid)!);
        fireEvent.mouseDown(overlay(single.uuid)!);
        document.removeEventListener('mousedown', onMouseDown);

        expect(onMouseDown).toHaveBeenCalledTimes(2);
    });

    describe('adding a parameter from a tile', () => {
        const free = tile('tile-free', 'tab-1');
        const mixed = tile('tile-mixed', 'tab-1');
        const addGroup = () =>
            screen.getByRole('group', {
                name: 'Other parameters on this tile',
                hidden: true,
            });
        const groupOptions = () =>
            within(addGroup())
                .getAllByRole('option', { hidden: true })
                .map((option) => option.textContent);

        beforeEach(() => {
            [free, mixed].forEach((t) => {
                const element = document.createElement('div');
                document.body.appendChild(element);
                mockContainers.current[t.uuid] = element;
            });
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [single, both, unreferenced, free, mixed],
                parameterControls: [
                    control(),
                    {
                        id: 'elsewhere',
                        label: 'Elsewhere',
                        parameterKeys: ['taken'],
                        tileTargets: {},
                    },
                ],
                parameterDefinitions: {
                    start: { label: 'Start date', default: '2025-07-06' },
                    end: { label: 'End date' },
                    region: { label: 'Region' },
                    taken: { label: 'Taken' },
                    amount: { label: 'Amount', type: 'number' },
                },
                tileParameterReferences: {
                    [single.uuid]: ['start'],
                    [both.uuid]: ['start', 'end'],
                    [unreferenced.uuid]: ['other', 'amount', 'taken'],
                    [free.uuid]: ['region'],
                    [mixed.uuid]: ['start', 'region', 'amount', 'taken'],
                },
            };
        });

        it('lists the free parameters of the kind the tile uses in a second group', async () => {
            renderWithProviders(<ParameterOverlays />);

            await userEvent.click(select(mixed.uuid));

            // Amount is another kind and Taken is in another control
            expect(optionLabels()).toEqual(['Start date', 'Region']);
            expect(groupOptions()).toEqual(['Region']);
            expect(
                within(
                    screen.getByRole('group', {
                        name: 'In this control',
                        hidden: true,
                    }),
                )
                    .getAllByRole('option', { hidden: true })
                    .map((option) => option.textContent),
            ).toEqual(['Start date']);
            expect(select(mixed.uuid)).not.toHaveAttribute('readonly');
            expect(select(mixed.uuid)).toHaveAccessibleName(
                'Period on this tile',
            );
        });

        it('has no second group on a tile with no free parameter', async () => {
            renderWithProviders(<ParameterOverlays />);

            await userEvent.click(select(both.uuid));

            expect(optionLabels()).toEqual([
                'All its parameters',
                'Start date',
                'End date',
            ]);
            expect(
                screen.queryByRole('group', { hidden: true }),
            ).not.toBeInTheDocument();
            expect(select(both.uuid)).toHaveAttribute('readonly');
        });

        it('reaches a tile that uses only a parameter it could add', async () => {
            renderWithProviders(<ParameterOverlays />);

            expect(overlay(free.uuid)).toHaveAttribute(
                'data-highlighted',
                'available',
            );
            expect(lines(free.uuid)).toEqual(['Not set']);
            expect(select(free.uuid)).toHaveTextContent('Select a parameter');
            expect(clearButton(free.uuid)).not.toBeInTheDocument();
            // No free parameter of the kind: still only the veil
            expect(overlay(unreferenced.uuid)).not.toHaveAttribute(
                'data-highlighted',
            );
            expect(lines(unreferenced.uuid)).toEqual([]);

            await userEvent.click(select(free.uuid));

            // One group only: a plain list with no label, still searchable
            expect(optionLabels()).toEqual(['Region']);
            expect(
                screen.queryByRole('group', { hidden: true }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText('Other parameters on this tile'),
            ).not.toBeInTheDocument();
            expect(select(free.uuid)).not.toHaveAttribute('readonly');
        });

        it('keeps "All its parameters" in the first group', async () => {
            const wide = tile('tile-wide', 'tab-1');
            const element = document.createElement('div');
            document.body.appendChild(element);
            mockContainers.current[wide.uuid] = element;
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [wide],
                tileParameterReferences: {
                    [wide.uuid]: ['start', 'end', 'region'],
                },
            };
            renderWithProviders(<ParameterOverlays />);

            await userEvent.click(select(wide.uuid));

            expect(
                within(
                    screen.getByRole('group', {
                        name: 'In this control',
                        hidden: true,
                    }),
                )
                    .getAllByRole('option', { hidden: true })
                    .map((option) => option.textContent),
            ).toEqual(['All its parameters', 'Start date', 'End date']);
            expect(groupOptions()).toEqual(['Region']);
        });

        it('adds the parameter and narrows this tile to it in one write, leaving the other tiles as they were set', async () => {
            renderWithProviders(<ParameterOverlays />);

            await userEvent.click(select(free.uuid));
            await chooseOption('Region');

            expect(updateControl).toHaveBeenCalledTimes(1);
            const next = updateControl.mock.calls[0][0];
            expect(next.parameterKeys).toEqual(['start', 'end', 'region']);
            // "mixed" also uses Region and had no entry, which would now mean
            // Region too: it is pinned to the parameter it was set by
            expect(next.tileTargets).toEqual({
                [free.uuid]: 'region',
                [mixed.uuid]: 'start',
            });
        });

        it('re-renders no tile when a parameter is hovered or the control changes without its parameters', () => {
            const editingControl = control({
                [single.uuid]: false,
                [both.uuid]: false,
                [mixed.uuid]: false,
            });
            const elsewhere = {
                id: 'elsewhere',
                label: 'Elsewhere',
                parameterKeys: ['taken'],
                tileTargets: {},
            };
            setSidebar({ editingControl });
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                parameterControls: [editingControl, elsewhere],
            };
            const { rerender } = renderWithProviders(<ParameterOverlays />);
            const first = { ...renderCounts.current };
            // single and mixed share a key; "free" has only other parameters
            expect(first).toEqual({ 'null|1': 2, 'null|3': 1, 'null|0': 1 });

            setSidebar({ editingControl, activeFieldId: 'start' });
            rerender(<ParameterOverlays />);
            // A new control object and a new list of controls
            const relabelled = { ...editingControl };
            setSidebar({ editingControl: relabelled });
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                parameterControls: [relabelled, elsewhere],
            };
            rerender(<ParameterOverlays />);

            expect(renderCounts.current).toEqual(first);
        });
    });

    it('renders nothing when no control is edited', () => {
        setSidebar({ editingControl: null });
        renderWithProviders(<ParameterOverlays />);

        allTiles.forEach((t) => expect(overlay(t.uuid)).toBeNull());
    });
});
