import { type HealthState } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultAbility } from '../../../../providers/Ability/constants';
import { renderWithProviders } from '../../../../testing/testUtils';
import { HeaderView } from './HeaderView';

vi.mock('react-router', () => ({
    useNavigate: () => vi.fn(),
    useLocation: () => ({ search: '', pathname: '/' }),
}));

// Redux-connected via the sqlRunner slice — the selectors are the only part
// of the store this component reads.
const mockState = {
    sqlRunner: {
        projectUuid: 'project-1',
        savedSqlChart: {
            savedSqlUuid: 'sql-chart-1',
            name: 'My SQL chart',
            slug: 'my-sql-chart',
            description: null,
            views: 0,
            firstViewedAt: null,
            lastUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
            lastUpdatedBy: null,
            space: { uuid: 'space-1', name: 'My space', userAccess: undefined },
        },
        modals: {
            addToDashboard: { isOpen: false },
            deleteChartModal: { isOpen: false },
        },
    },
};

vi.mock('../../store/hooks', () => ({
    useAppDispatch: () => vi.fn(),
    useAppSelector: (selector: (state: typeof mockState) => unknown) =>
        selector(mockState),
}));

vi.mock('../../../../hooks/useProject', () => ({
    useProject: vi.fn(() => ({ data: { upstreamProjectUuid: undefined } })),
}));

vi.mock('../../hooks/useSavedSqlCharts', () => ({
    usePromoteSqlChartMutation: vi.fn(() => ({ mutate: vi.fn() })),
    usePromoteSqlChartDiffMutation: vi.fn(() => ({
        mutate: vi.fn(),
        data: undefined,
        reset: vi.fn(),
        isLoading: false,
    })),
}));

// None of these open during these tests — stubbed so their dependency trees
// never mount.
vi.mock(
    '../../../../components/SavedDashboards/AddTilesToDashboardModal',
    () => ({
        default: () => null,
    }),
);
vi.mock('../DeleteSqlChartModal', () => ({ DeleteSqlChartModal: () => null }));
vi.mock('../../../sync/components/SqlChartSyncModal', () => ({
    SqlChartSyncModal: () => null,
}));
vi.mock('../../../promotion/components/PromotionConfirmDialog', () => ({
    PromotionConfirmDialog: () => null,
}));
vi.mock(
    '../../../../components/Explorer/SavedChartsHeader/TitleBreadcrumbs',
    () => ({ TitleBreadCrumbs: () => null }),
);
vi.mock(
    '../../../../components/common/ResourceInfoPopup/ResourceInfoPopup',
    () => ({ ResourceInfoPopup: () => null }),
);
vi.mock('../../../../components/common/PageHeader/UpdatedInfo', () => ({
    UpdatedInfo: () => null,
}));

// Matches AppProviderMock's default user fixture (mockUserResponse).
const DEFAULT_ORG_UUID = '172a2270-000f-42be-9c68-c4752c23ae51';

const withGoogleDriveConfigured = (): Partial<HealthState> => ({
    auth: {
        google: {
            oauth2ClientId: 'client-id',
            googleDriveApiKey: 'api-key',
        },
    } as HealthState['auth'],
});

// `Can` reads the module-level `defaultAbility` singleton, not the mocked
// `user.data` — the real app calls `ability.update(user.abilityRules)` on this
// same instance from PrivateRoute.
const grantGoogleSheetsAbility = () => {
    defaultAbility.update([
        {
            action: 'manage',
            subject: 'GoogleSheets',
            conditions: { organizationUuid: DEFAULT_ORG_UUID },
        },
    ]);
};

/** Delivery permissions only — no `manage` on SavedChart or SqlRunner. */
const viewOnlyWithDeliveryPermissions = () => ({
    abilityRules: [
        {
            action: 'create' as const,
            subject: 'ScheduledDeliveries' as const,
            conditions: {
                organizationUuid: DEFAULT_ORG_UUID,
                projectUuid: 'project-1',
            },
        },
        {
            action: 'manage' as const,
            subject: 'GoogleSheets' as const,
            conditions: {
                organizationUuid: DEFAULT_ORG_UUID,
                projectUuid: 'project-1',
            },
        },
    ],
});

// The menu target itself is gated on an async health query, so wait for it
// rather than racing the first render.
const openMenu = async () => {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button'));
};

describe('HeaderView — Google Sheets Sync entry point', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        defaultAbility.update([]);
    });

    afterEach(() => {
        defaultAbility.update([]);
    });

    it('shows Google Sheets Sync without chart edit access', async () => {
        grantGoogleSheetsAbility();
        renderWithProviders(<HeaderView />, {
            health: withGoogleDriveConfigured(),
            user: viewOnlyWithDeliveryPermissions(),
        });

        await openMenu();

        expect(
            await screen.findByText('Google Sheets Sync'),
        ).toBeInTheDocument();
    });

    it('hides manage-only actions from a user without chart edit access', async () => {
        grantGoogleSheetsAbility();
        renderWithProviders(<HeaderView />, {
            health: withGoogleDriveConfigured(),
            user: viewOnlyWithDeliveryPermissions(),
        });

        await openMenu();
        await screen.findByText('Google Sheets Sync');

        expect(screen.queryByText('Add to dashboard')).not.toBeInTheDocument();
        expect(screen.queryByText('Delete')).not.toBeInTheDocument();
        expect(screen.queryByText('Edit chart')).not.toBeInTheDocument();
    });

    it('renders no menu when the user has neither edit nor delivery permissions', () => {
        renderWithProviders(<HeaderView />, {
            health: withGoogleDriveConfigured(),
            user: { abilityRules: [] },
        });

        // Synchronous on purpose: dropping the gate would render the target on
        // the first pass, so this catches it without polling. The tests above
        // are what prove the menu appears once permissions are granted.
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
