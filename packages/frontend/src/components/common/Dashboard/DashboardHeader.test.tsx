import { type Dashboard } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type PendingChange } from '../../../features/dashboard/pendingChanges/getPendingChanges';
import { type EditFiltersVisibility } from '../../../features/dashboardFilters/EditFiltersVisibilityControl';
import { renderWithProviders } from '../../../testing/testUtils';
import DashboardHeader from './DashboardHeader';

const mocks = vi.hoisted(() => ({
    flagEnabled: true,
    userCanManageDashboard: true,
}));

vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: mocks.flagEnabled } }),
}));
vi.mock('../../../hooks/useProjectRoute', () => ({
    useProjectUrlIdentifier: () => 'project-slug',
    useOptionalProjectRoute: () => undefined,
}));
vi.mock('./useDashboardManageAccess', () => ({
    useDashboardManageAccess: () => ({
        hasDashboardManageAbility: mocks.userCanManageDashboard,
        userCanManageDashboard: mocks.userCanManageDashboard,
    }),
}));
vi.mock('../../../features/comments', () => ({
    DashboardCommentsPanel: () => null,
    useDashboardCommentsSummary: () => ({
        canViewDashboardComments: false,
        openThreadCount: 0,
        unreadCount: 0,
        markAllAsViewed: vi.fn(),
    }),
}));
vi.mock('../../../ee/features/contentReview', () => ({
    PendingReviewBadge: () => null,
    RequestReviewModal: () => null,
    useContentReviewEligibility: () => ({ pendingRequest: null }),
}));
vi.mock('../../DashboardTiles/AddTileButton', () => ({ default: () => null }));
vi.mock('./DashboardRefreshButton', () => ({
    DashboardRefreshButton: () => null,
}));
vi.mock('./PendingChangesButton', () => ({
    PendingChangesButton: () => <span>Changes status</span>,
}));
vi.mock('./TileLayoutHistoryButtons', () => ({
    TileLayoutHistoryButtons: () => null,
}));
vi.mock('./TidyTilesButton', () => ({ TidyTilesButton: () => null }));
vi.mock('./CanvasZoomControls', () => ({ CanvasZoomControls: () => null }));
vi.mock('./DashboardPerformanceWarning', () => ({
    DashboardPerformanceWarning: () => null,
}));

const renderHeader = (
    isEditMode: boolean,
    pendingSettingsChanges: PendingChange[] | null = null,
    editFiltersVisibility: EditFiltersVisibility | null = null,
) =>
    renderWithProviders(
        <MemoryRouter>
            <DashboardHeader
                {...({
                    dashboard: {
                        uuid: 'dashboard-uuid',
                        slug: 'weekly-revenue',
                        name: 'Weekly revenue',
                        tiles: [],
                        tabs: [],
                        access: [],
                    } as unknown as Dashboard,
                    isEditMode,
                    hasDashboardChanged: false,
                    isSaving: false,
                    isFullscreen: false,
                    isMovingDashboardToSpace: false,
                    isFitToScreen: false,
                    isFitToScreenAvailable: false,
                    editFiltersVisibility,
                    pendingSettingsChanges,
                } as ComponentProps<typeof DashboardHeader>)}
            />
        </MemoryRouter>,
    );

describe('DashboardHeader editing badge', () => {
    beforeEach(() => {
        mocks.flagEnabled = true;
        mocks.userCanManageDashboard = true;
    });

    it('shows the badge and the edit details button while editing', () => {
        renderHeader(true);
        expect(screen.getByText('Editing')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Edit details' }),
        ).toBeInTheDocument();
    });

    it('hides the badge when the dashboard controls flag is off', () => {
        mocks.flagEnabled = false;
        renderHeader(true);
        expect(screen.queryByText('Editing')).not.toBeInTheDocument();
    });

    it('replaces the badge with the unsaved changes status', () => {
        renderHeader(true, []);
        expect(screen.queryByText('Editing')).not.toBeInTheDocument();
        expect(screen.getByText('Changes status')).toBeInTheDocument();
    });

    it('hides the badge in view mode', () => {
        renderHeader(false);
        expect(screen.queryByText('Editing')).not.toBeInTheDocument();
    });

    it('hides the badge from a user who cannot manage the dashboard', () => {
        mocks.userCanManageDashboard = false;
        renderHeader(true);
        expect(screen.queryByText('Editing')).not.toBeInTheDocument();
    });
});

describe('DashboardHeader edit bar visibility switch', () => {
    beforeEach(() => {
        mocks.userCanManageDashboard = true;
    });

    it.each([
        [true, 'Controls visibility while editing', 'Controls'],
        [false, 'Filters visibility while editing', 'Filters'],
    ])(
        'names the switch for the controls flag %s',
        (isFlagOn, ariaLabel, label) => {
            mocks.flagEnabled = isFlagOn;
            renderHeader(true, null, 'all');
            expect(screen.getByLabelText(ariaLabel)).toBeInTheDocument();
            expect(screen.getByText(label)).toBeInTheDocument();
        },
    );
});
