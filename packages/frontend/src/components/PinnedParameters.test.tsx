import { DEFAULT_UI_STRINGS } from '@lightdash/common';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../testing/testUtils';
import PinnedParameters from './PinnedParameters';

const dashboardState = vi.hoisted(() => ({
    dashboard: { projectUuid: 'project' },
    parameterValues: {} as Record<string, string | number>,
    parameterDefinitions: {
        status: {
            label: 'Status',
            default: 'all',
            options: ['Cancelled', 'Expired'],
        },
    },
    pinnedParameters: ['status'],
    setParameter: vi.fn(),
    toggleParameterPin: vi.fn(),
    setPinnedParameters: vi.fn(),
}));

vi.mock('../providers/Dashboard/useDashboardContext', () => ({
    default: (selector: (state: typeof dashboardState) => unknown) =>
        selector(dashboardState),
}));
vi.mock('../ee/providers/Embed/useUiStrings', () => ({
    useUiStrings: () => (key: keyof typeof DEFAULT_UI_STRINGS) =>
        DEFAULT_UI_STRINGS[key],
}));

describe('PinnedParameters', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        dashboardState.parameterValues = {};
    });

    it('identifies inherited values without implying a selection', () => {
        const { getByRole } = renderWithProviders(
            <PinnedParameters isEditMode={false} />,
        );
        expect(
            getByRole('button', { name: 'Status: Default: all' }),
        ).toBeInTheDocument();
    });

    it('keeps an explicit zero instead of replacing it with the default', () => {
        dashboardState.parameterValues = { status: 0 };
        const { getByRole } = renderWithProviders(
            <PinnedParameters isEditMode={false} />,
        );
        expect(getByRole('button', { name: 'Status: 0' })).toBeInTheDocument();
    });

    it('unpins using a named sibling control without changing the value', async () => {
        dashboardState.parameterValues = { status: 'Cancelled' };
        const { getByRole, container } = renderWithProviders(
            <PinnedParameters isEditMode />,
        );
        await userEvent.click(
            getByRole('button', { name: 'Unpin parameter: Status' }),
        );
        expect(dashboardState.toggleParameterPin).toHaveBeenCalledWith(
            'status',
        );
        expect(dashboardState.setParameter).not.toHaveBeenCalled();
        expect(container.querySelector('button button')).toBeNull();
    });
});
