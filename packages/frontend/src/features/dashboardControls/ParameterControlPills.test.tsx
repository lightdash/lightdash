import {
    DashboardTileTypes,
    type DashboardParameterControl,
    type DashboardTile,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
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
    useControlsSidebar: () => mockSidebar.current,
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
        props: { isEditMode: boolean; activeTabUuid?: string } = {
            isEditMode: true,
        },
    ) =>
        renderWithProviders(
            <ParameterControlPills
                isEditMode={props.isEditMode}
                activeTabUuid={props.activeTabUuid}
            />,
        );

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
        expect(pill(/^New parameter control/)).toHaveTextContent(
            'New parameter control · no value',
        );
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
            screen.queryByRole('button', { name: /^New parameter control/ }),
        ).not.toBeInTheDocument();
    });
});
