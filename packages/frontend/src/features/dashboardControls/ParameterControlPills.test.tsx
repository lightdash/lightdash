import {
    DashboardTileTypes,
    type DashboardParameterControl,
    type DashboardTile,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { ParameterControlPills } from './ParameterControlPills';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: Record<string, unknown>) => unknown,
    ) => selector(mockSidebar.current),
}));
// The shipped input has its own tests; the stub pins what the pill passes and receives
vi.mock('../parameters/components/ParameterInput', () => ({
    ParameterInput: ({
        paramKey,
        onParameterChange,
    }: {
        paramKey: string;
        onParameterChange: (key: string, value: string | null) => void;
    }) => (
        <button onClick={() => onParameterChange(paramKey, 'APAC')}>
            Set {paramKey} to APAC
        </button>
    ),
}));

const tile = (uuid: string, tabUuid: string) =>
    ({
        uuid,
        tabUuid,
        type: DashboardTileTypes.SAVED_CHART,
        properties: {},
    }) as DashboardTile;

const region: DashboardParameterControl = {
    id: 'region',
    label: 'Region',
    parameterKeys: ['region', 'sales_region'],
    tileTargets: {},
};
const period: DashboardParameterControl = {
    id: 'period',
    label: 'Period',
    parameterKeys: ['start'],
    tileTargets: {},
};
const unlabelled: DashboardParameterControl = {
    id: 'unlabelled',
    label: '',
    parameterKeys: ['plan'],
    tileTargets: {},
};

describe('ParameterControlPills', () => {
    const openControl = vi.fn();
    const removeControlById = vi.fn();
    const setParameter = vi.fn();

    const pill = (name: RegExp) => screen.getByRole('button', { name });
    const renderPills = (
        props: {
            isEditMode: boolean;
            activeTabUuid?: string;
            missingRequiredParameters?: string[];
            shadowedReservedNames?: string[];
        } = {
            isEditMode: true,
        },
    ) =>
        renderWithProviders(
            <ParameterControlPills
                isEditMode={props.isEditMode}
                activeTabUuid={props.activeTabUuid}
                missingRequiredParameters={
                    props.missingRequiredParameters ?? []
                }
                shadowedReservedNames={props.shadowedReservedNames ?? []}
            />,
        );
    const setContext = (overrides: Record<string, unknown>) => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            ...overrides,
        };
    };

    beforeEach(() => {
        openControl.mockClear();
        removeControlById.mockClear();
        setParameter.mockClear();
        mockDashboardContext.current = {
            parameterControls: [region, period, unlabelled],
            parameterValues: { region: 'EMEA', sales_region: 'EMEA' },
            setParameter,
            parameterDefinitions: {
                region: { label: 'Region' },
                sales_region: { label: 'Sales region' },
                start: {
                    label: 'Start',
                    type: 'date',
                    default: '2025-07-06',
                },
                plan: { label: 'Plan' },
            },
            projectUuid: 'project-1',
            dashboardTiles: [tile('tile-1', 'tab-1'), tile('tile-2', 'tab-2')],
            tileParameterReferences: {},
        };
        mockSidebar.current = {
            editingControl: null,
            isSidebarOpen: false,
            openControl,
            removeControlById,
        };
    });

    it('renders the label and value of each control', () => {
        renderPills();

        expect(pill(/^Region/)).toHaveTextContent('Region is EMEA');
        expect(pill(/^Period/)).toHaveTextContent('Period is July 6, 2025');
        // An unnamed control reads as its parameter
        expect(pill(/^Plan/)).toHaveTextContent('Plan · no value');
    });

    it('opens the control on click in edit mode', async () => {
        renderPills();

        await userEvent.click(pill(/^Region/));

        expect(openControl).toHaveBeenCalledWith('region');
        expect(pill(/^Region/)).toHaveAttribute('aria-pressed', 'false');
    });

    it('marks the edited control as selected', () => {
        mockSidebar.current = {
            ...mockSidebar.current,
            editingControl: period,
        };
        renderPills();

        expect(pill(/^Period/)).toHaveAttribute('aria-pressed', 'true');
        expect(pill(/^Region/)).toHaveAttribute('aria-pressed', 'false');
    });

    it('removes the control with the X without opening it', async () => {
        renderPills();

        await userEvent.click(
            screen.getAllByRole('button', { name: 'Remove control' })[1],
        );

        expect(removeControlById).toHaveBeenCalledWith('period');
        expect(openControl).not.toHaveBeenCalled();
    });

    it('hides the X while the sidebar is open', () => {
        mockSidebar.current = { ...mockSidebar.current, isSidebarOpen: true };
        renderPills();

        expect(
            screen.queryByRole('button', { name: 'Remove control' }),
        ).not.toBeInTheDocument();
    });

    it('sets every parameter of the control in view mode', async () => {
        renderPills({ isEditMode: false });

        expect(
            screen.queryByRole('button', { name: 'Remove control' }),
        ).not.toBeInTheDocument();
        await userEvent.click(pill(/^Region/));
        await userEvent.click(
            await screen.findByRole('button', { name: 'Set region to APAC' }),
        );

        expect(openControl).not.toHaveBeenCalled();
        expect(setParameter.mock.calls).toEqual([
            ['region', 'APAC'],
            ['sales_region', 'APAC'],
        ]);
    });

    it('shows every control until a tile on the tab reports its parameters', () => {
        renderPills({ isEditMode: true, activeTabUuid: 'tab-1' });

        expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(
            3,
        );
    });

    it('shows only the controls that set a tile on the active tab', () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            parameterControls: [
                region,
                { ...period, tileTargets: { 'tile-1': false } },
                unlabelled,
            ],
            tileParameterReferences: {
                'tile-1': ['region', 'start'],
                'tile-2': ['plan'],
            },
        };
        renderPills({ isEditMode: true, activeTabUuid: 'tab-1' });

        expect(pill(/^Region/)).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /^Period/ }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /^Plan/ }),
        ).not.toBeInTheDocument();
    });

    describe('a control on one parameter, for a viewer', () => {
        const planControl: DashboardParameterControl = {
            id: 'plan',
            label: 'Tier',
            parameterKeys: ['plan'],
            tileTargets: {},
        };
        const planDefinition = {
            label: 'Plan',
            description: 'The subscription plan',
            options: ['free', 'pro'],
        };

        beforeEach(() => {
            setContext({
                parameterControls: [planControl],
                parameterValues: { plan: 'pro' },
                parameterDefinitions: { plan: planDefinition },
            });
        });

        it('is the shipped pill under the label of the control', () => {
            renderPills({ isEditMode: false });

            expect(pill(/^Tier/)).toHaveTextContent('Tier is pro');
            expect(pill(/^Tier/)).not.toHaveAttribute('aria-pressed');
            expect(pill(/^Tier/).className).toContain('button');
        });

        it('falls back to the label of the parameter', () => {
            setContext({ parameterControls: [{ ...planControl, label: '' }] });
            renderPills({ isEditMode: false });

            expect(pill(/^Plan/)).toHaveTextContent('Plan is pro');
        });

        it('clears the value from the X', async () => {
            renderPills({ isEditMode: false });

            await userEvent.click(
                screen.getByRole('button', { name: 'Clear parameter' }),
            );

            expect(setParameter.mock.calls).toEqual([['plan', null]]);
        });

        it('opens the shipped input and sets the parameter', async () => {
            renderPills({ isEditMode: false });

            await userEvent.click(pill(/^Tier/));
            await userEvent.click(
                await screen.findByRole('button', { name: 'Set plan to APAC' }),
            );

            expect(openControl).not.toHaveBeenCalled();
            expect(setParameter.mock.calls).toEqual([['plan', 'APAC']]);
        });

        it('outlines a required parameter with no value', () => {
            setContext({ parameterValues: {} });
            renderPills({
                isEditMode: false,
                missingRequiredParameters: ['plan'],
            });

            expect(pill(/^Tier/)).toHaveAttribute('data-variant', 'outline');
            expect(pill(/^Tier/).className).toContain('unsetRequired');
            expect(pill(/^Tier/)).toHaveTextContent('Tier is any value');
        });

        it('treats a value outside the options as unset', () => {
            setContext({ parameterValues: { plan: 'enterprise' } });
            renderPills({ isEditMode: false });

            expect(pill(/^Tier/)).toHaveTextContent('Tier is any value');
            expect(
                screen.queryByRole('button', { name: 'Clear parameter' }),
            ).not.toBeInTheDocument();
        });

        it('shows the description on hover', async () => {
            renderPills({ isEditMode: false });

            fireEvent.mouseEnter(pill(/^Tier/));

            expect(
                await screen.findByText('The subscription plan'),
            ).toBeInTheDocument();
        });

        it('warns when the parameter shadows a reserved name', async () => {
            const { container } = renderPills({
                isEditMode: false,
                shadowedReservedNames: ['plan'],
            });

            const warning = container.querySelector(
                '[data-position="right"] svg',
            );
            expect(warning).not.toBeNull();
            fireEvent.mouseEnter(warning!);
            expect(
                await screen.findByText(/^Parameter plan overrides/),
            ).toBeInTheDocument();
        });

        it('stays the control pill in edit mode, with the same states', async () => {
            setContext({ parameterValues: { plan: 'enterprise' } });
            const { container } = renderPills({
                isEditMode: true,
                missingRequiredParameters: ['plan'],
                shadowedReservedNames: ['plan'],
            });

            expect(pill(/^Tier/)).toHaveAttribute('aria-pressed', 'false');
            expect(pill(/^Tier/)).toHaveTextContent('Tier \u00b7 no value');
            expect(pill(/^Tier/)).toHaveAttribute('data-variant', 'outline');
            expect(pill(/^Tier/).className).toContain('unsetRequired');
            expect(
                screen.getByRole('button', { name: 'Remove control' }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Clear parameter' }),
            ).not.toBeInTheDocument();

            fireEvent.mouseEnter(
                container.querySelector('[data-position="right"] svg')!,
            );
            expect(
                await screen.findByText(/^Parameter plan overrides/),
            ).toBeInTheDocument();

            await userEvent.click(pill(/^Tier/));
            expect(openControl).toHaveBeenCalledWith('plan');
        });
    });

    describe('a control on several parameters', () => {
        it('clears every parameter from the X in view mode', async () => {
            renderPills({ isEditMode: false });

            await userEvent.click(
                screen.getByRole('button', { name: 'Clear parameter' }),
            );

            expect(setParameter.mock.calls).toEqual([
                ['region', null],
                ['sales_region', null],
            ]);
        });

        it('has no clear X without a value', () => {
            setContext({ parameterControls: [region], parameterValues: {} });
            renderPills({ isEditMode: false });

            expect(
                screen.queryByRole('button', { name: 'Clear parameter' }),
            ).not.toBeInTheDocument();
        });

        it('outlines the pill while a required parameter has no value', () => {
            setContext({ parameterControls: [region], parameterValues: {} });
            renderPills({
                isEditMode: false,
                missingRequiredParameters: ['sales_region'],
            });

            expect(pill(/^Region/)).toHaveAttribute('data-variant', 'outline');
            expect(pill(/^Region/).className).toContain('unsetRequired');
        });

        it('keeps the default look once the parameter has a value', () => {
            renderPills({
                isEditMode: false,
                missingRequiredParameters: [],
            });

            expect(pill(/^Region/)).toHaveAttribute('data-variant', 'default');
        });
    });
});
