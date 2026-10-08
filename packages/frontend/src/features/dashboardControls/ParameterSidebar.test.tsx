import {
    DashboardTileTypes,
    type DashboardParameterControl,
    type DashboardTab,
    type DashboardTile,
    type ParameterValue,
} from '@lightdash/common';
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { ParameterSidebar } from './ParameterSidebar';
import { type ControlsSidebarContextValue } from './useControlsSidebar';
import { LABEL_COMMIT_DELAY } from './useLabelDraft';

const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
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
vi.mock('../parameters/components/ParameterInput', () => ({
    ParameterInput: ({
        paramKey,
        value,
        onParameterChange,
    }: {
        paramKey: string;
        value: ParameterValue | null;
        onParameterChange: (key: string, value: ParameterValue | null) => void;
    }) => (
        <button
            type="button"
            data-testid="parameter-input"
            data-key={paramKey}
            data-value={String(value)}
            onClick={() => onParameterChange(paramKey, 'north')}
        />
    ),
}));

const tile = (uuid: string, tabUuid?: string) =>
    ({ uuid, tabUuid, type: DashboardTileTypes.SAVED_CHART }) as DashboardTile;

const tab = (uuid: string, order: number) =>
    ({ uuid, name: uuid, order }) as DashboardTab;

const makeControl = (
    overrides: Partial<DashboardParameterControl> = {},
): DashboardParameterControl => ({
    id: 'control-1',
    label: 'Region',
    parameterKeys: ['region'],
    tileTargets: {},
    ...overrides,
});

const setParameter = vi.fn();

const setSidebar = (overrides: Partial<ControlsSidebarContextValue> = {}) => {
    const value: ControlsSidebarContextValue = {
        editing: null,
        isNew: false,
        isPlaceholder: false,
        editingRule: null,
        isSidebarOpen: true,
        activeSection: 'fields',
        setActiveSection: vi.fn(),
        open: vi.fn(),
        openNew: vi.fn(),
        addFirstField: vi.fn(),
        clearFields: vi.fn(),
        highlightedFieldId: null,
        setHighlightedFieldId: vi.fn(),
        hoveredFieldId: null,
        setHoveredFieldId: vi.fn(),
        activeFieldId: null,
        waitingFieldIds: [],
        addWaitingField: vi.fn(),
        removeWaitingField: vi.fn(),
        updateFilter: vi.fn(),
        removeFilter: vi.fn(),
        removeFilterById: vi.fn(),
        discard: vi.fn(),
        close: vi.fn(),
        isDirty: false,
        editingControl: makeControl(),
        isNewControl: false,
        openControl: vi.fn(),
        addParameterControl: vi.fn(),
        updateControl: vi.fn(),
        setControlValue: vi.fn(),
        removeControl: vi.fn(),
        removeControlById: vi.fn(),
        newTileUuids: [],
        dismissedLinks: [],
        dismissLink: vi.fn(),
        ...overrides,
    };
    mockSidebar.current = value;
    return value;
};

const setDashboard = (overrides: Record<string, unknown> = {}) => {
    mockDashboardContext.current = {
        parameterControls: [makeControl()],
        parameterValues: {},
        setParameter,
        parameterDefinitions: {
            region: { label: 'Sales region' },
            area: { label: 'Area' },
            limit: { label: 'Row limit', type: 'number' },
        },
        tileParameterReferences: {
            a: ['region', 'area'],
            b: ['region'],
            c: ['limit'],
        },
        dashboardTiles: [tile('a'), tile('b'), tile('c')],
        dashboardTabs: [],
        projectUuid: 'project-1',
        ...overrides,
    };
};

describe('ParameterSidebar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setDashboard();
    });

    it('renders nothing when no parameter control is edited', () => {
        setSidebar({ editingControl: null });
        renderWithProviders(<ParameterSidebar />);
        expect(screen.queryByText('Parameters and tiles')).toBeNull();
    });

    it('titles an existing control and counts every tile', () => {
        setSidebar({
            editingControl: makeControl({ tileTargets: { b: false } }),
            isDirty: true,
        });
        renderWithProviders(<ParameterSidebar />);

        expect(
            screen.getByRole('heading', { name: 'Region' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText('1 parameter · sets 1 of 3 tiles'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Parameter · 1 of 2 tiles'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Discard changes' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
        expect(screen.queryByText('Suggestions')).not.toBeInTheDocument();
    });

    it('adds the tabs the control reaches when the dashboard has several', () => {
        setDashboard({
            dashboardTiles: [tile('a', 't1'), tile('b', 't1'), tile('c', 't2')],
            dashboardTabs: [tab('t1', 0), tab('t2', 1)],
        });
        setSidebar();
        renderWithProviders(<ParameterSidebar />);
        expect(
            screen.getByText('1 parameter · sets 2 of 3 tiles on 1 of 2 tabs'),
        ).toBeInTheDocument();
    });

    it('asks a new control for a label and suggests one', () => {
        const control = makeControl({ label: '' });
        const { close, updateControl } = setSidebar({
            editingControl: control,
            isNewControl: true,
            isDirty: true,
        });
        renderWithProviders(<ParameterSidebar />);

        expect(
            screen.getByRole('heading', { name: 'New parameter control' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText('1 parameter · sets 2 of 3 tiles'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Add a label to keep this control'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Discard control' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'More actions' }),
        ).not.toBeInTheDocument();

        const input = screen.getByPlaceholderText('What viewers will see');
        expect(
            screen.queryByText('Add a label so viewers know what this sets'),
        ).not.toBeInTheDocument();
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(close).not.toHaveBeenCalled();
        expect(
            screen.getByText('Add a label so viewers know what this sets'),
        ).toBeInTheDocument();

        // The chip comes before the parameter row of the same name
        fireEvent.click(
            screen.getAllByRole('button', { name: 'Sales region' })[0],
        );
        expect(updateControl).toHaveBeenCalledWith({
            ...control,
            label: 'Sales region',
        });
    });

    it('keeps on Done or the X and discards', () => {
        const { close, discard } = setSidebar({ isDirty: true });
        renderWithProviders(<ParameterSidebar />);

        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(close).toHaveBeenCalledTimes(2);
        fireEvent.click(screen.getByText('Discard changes'));
        expect(discard).toHaveBeenCalledTimes(1);
    });

    describe('label draft', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        const labelInput = () =>
            screen.getByPlaceholderText('What viewers will see');
        const typeLabel = (value: string) =>
            fireEvent.change(labelInput(), { target: { value } });

        it('reacts to typing at once and writes the label after a pause', () => {
            vi.useFakeTimers();
            const control = makeControl();
            const { updateControl } = setSidebar({ editingControl: control });
            renderWithProviders(<ParameterSidebar />);

            typeLabel('Ar');
            typeLabel('Area');
            expect(labelInput()).toHaveValue('Area');
            expect(
                screen.getByRole('heading', { name: 'Area' }),
            ).toBeInTheDocument();
            act(() => {
                vi.advanceTimersByTime(LABEL_COMMIT_DELAY - 1);
            });
            expect(updateControl).not.toHaveBeenCalled();

            act(() => {
                vi.advanceTimersByTime(1);
            });
            expect(updateControl).toHaveBeenCalledTimes(1);
            expect(updateControl).toHaveBeenCalledWith({
                ...control,
                label: 'Area',
            });
        });

        it('sends the typed label before Done closes', async () => {
            const control = makeControl({ label: '' });
            const { updateControl, close } = setSidebar({
                editingControl: control,
                isNewControl: true,
            });
            renderWithProviders(<ParameterSidebar />);

            await userEvent.type(labelInput(), 'Area');
            expect(
                screen.queryByText('Add a label to keep this control'),
            ).not.toBeInTheDocument();
            await userEvent.click(screen.getByRole('button', { name: 'Done' }));

            expect(updateControl).toHaveBeenLastCalledWith({
                ...control,
                label: 'Area',
            });
            expect(close).toHaveBeenCalledTimes(1);
            expect(
                vi.mocked(updateControl).mock.invocationCallOrder.at(-1),
            ).toBeLessThan(vi.mocked(close).mock.invocationCallOrder[0]);
        });

        it('sends the typed label before Enter closes, once', () => {
            vi.useFakeTimers();
            const control = makeControl({ label: '' });
            const { updateControl, close } = setSidebar({
                editingControl: control,
                isNewControl: true,
            });
            renderWithProviders(<ParameterSidebar />);

            typeLabel('Area');
            fireEvent.keyDown(labelInput(), { key: 'Enter' });

            expect(updateControl).toHaveBeenCalledWith({
                ...control,
                label: 'Area',
            });
            expect(close).toHaveBeenCalledTimes(1);
            expect(
                vi.mocked(updateControl).mock.invocationCallOrder[0],
            ).toBeLessThan(vi.mocked(close).mock.invocationCallOrder[0]);
            act(() => {
                vi.advanceTimersByTime(LABEL_COMMIT_DELAY * 2);
            });
            expect(updateControl).toHaveBeenCalledTimes(1);
        });

        it('starts over when another control is opened, with no late write', () => {
            vi.useFakeTimers();
            const first = setSidebar();
            const { rerender } = renderWithProviders(<ParameterSidebar />);
            typeLabel('Half typed');

            const second = setSidebar({
                editingControl: makeControl({ id: 'control-2', label: 'Area' }),
            });
            rerender(<ParameterSidebar />);

            expect(labelInput()).toHaveValue('Area');
            act(() => {
                vi.advanceTimersByTime(LABEL_COMMIT_DELAY * 2);
            });
            expect(first.updateControl).not.toHaveBeenCalled();
            expect(second.updateControl).not.toHaveBeenCalled();
        });
    });

    it('removes a parameter only when the control holds several', async () => {
        const control = makeControl({
            parameterKeys: ['region', 'area'],
            tileTargets: { a: 'area', b: false },
        });
        const { updateControl } = setSidebar({ editingControl: control });
        const { rerender } = renderWithProviders(<ParameterSidebar />);

        fireEvent.click(screen.getByLabelText('More actions for Area'));
        fireEvent.click(await screen.findByText('Remove parameter'));
        expect(updateControl).toHaveBeenCalledWith({
            ...control,
            parameterKeys: ['region'],
            tileTargets: { b: false },
        });

        setSidebar();
        rerender(<ParameterSidebar />);
        expect(
            screen.queryByLabelText('More actions for Sales region'),
        ).not.toBeInTheDocument();
    });

    it('highlights the tiles of a clicked parameter', () => {
        const { setHighlightedFieldId, setHoveredFieldId } = setSidebar();
        renderWithProviders(<ParameterSidebar />);

        const row = screen.getByRole('button', { name: 'Sales region' });
        fireEvent.mouseEnter(row);
        expect(setHoveredFieldId).toHaveBeenCalledWith('region');
        fireEvent.click(row);
        expect(setHighlightedFieldId).toHaveBeenCalledWith('region');
    });

    it('adds a free parameter of the same kind with the control value', async () => {
        setDashboard({ parameterValues: { region: 'south' } });
        const control = makeControl();
        const { updateControl } = setSidebar({ editingControl: control });
        renderWithProviders(<ParameterSidebar />);

        await userEvent.click(
            screen.getByRole('button', { name: 'Add a parameter' }),
        );
        const options = screen.getAllByRole('option', { hidden: true });
        expect(options.map((option) => option.textContent)).toEqual(['Area']);

        await userEvent.click(options[0]);
        expect(updateControl).toHaveBeenCalledWith({
            ...control,
            parameterKeys: ['region', 'area'],
        });
        expect(setParameter).toHaveBeenCalledWith('area', 'south');
    });

    it('clears the added parameter when the control has no value', async () => {
        setSidebar();
        renderWithProviders(<ParameterSidebar />);

        await userEvent.click(
            screen.getByRole('button', { name: 'Add a parameter' }),
        );
        await userEvent.click(screen.getByRole('option', { hidden: true }));
        expect(setParameter).toHaveBeenCalledWith('area', null);
    });

    it('disables Add when every parameter of the kind is in a control', async () => {
        setDashboard({
            parameterControls: [
                makeControl(),
                makeControl({ id: 'control-2', parameterKeys: ['area'] }),
            ],
        });
        setSidebar();
        renderWithProviders(<ParameterSidebar />);

        const add = screen.getByRole('button', { name: 'Add a parameter' });
        expect(add).toHaveAttribute('aria-disabled', 'true');
        await userEvent.click(add);
        expect(
            screen.queryByPlaceholderText('Search parameters'),
        ).not.toBeInTheDocument();
    });

    it('removes the control on the second click', async () => {
        const { removeControl } = setSidebar();
        renderWithProviders(<ParameterSidebar />);

        fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
        fireEvent.click(await screen.findByText('Remove control'));
        expect(removeControl).not.toHaveBeenCalled();
        fireEvent.click(await screen.findByText('Click again to remove'));
        expect(removeControl).toHaveBeenCalledTimes(1);
    });

    it('switches tabs and sets the default value from Settings', () => {
        const { setActiveSection } = setSidebar();
        const { rerender } = renderWithProviders(<ParameterSidebar />);

        fireEvent.click(screen.getByRole('tab', { name: /Settings/ }));
        expect(setActiveSection).toHaveBeenCalledWith('settings');

        const { setControlValue } = setSidebar({ activeSection: 'settings' });
        rerender(<ParameterSidebar />);
        expect(screen.getByText('Default value')).toBeInTheDocument();
        expect(
            screen.getByText(
                'Not set: each tile keeps its own value until a viewer picks one.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Parameters in this control'),
        ).not.toBeInTheDocument();

        const input = screen.getByTestId('parameter-input');
        expect(input).toHaveAttribute('data-key', 'region');
        fireEvent.click(input);
        expect(setControlValue).toHaveBeenCalledWith('north');
    });

    it('drops the note once the control has a value', () => {
        setDashboard({ parameterValues: { region: 'south' } });
        setSidebar({ activeSection: 'settings' });
        renderWithProviders(<ParameterSidebar />);

        expect(screen.getByTestId('parameter-input')).toHaveAttribute(
            'data-value',
            'south',
        );
        expect(screen.queryByText(/Not set/)).not.toBeInTheDocument();
    });
});
