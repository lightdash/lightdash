import { type HealthState } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultAbility } from '../../../providers/Ability/constants';
import { renderWithProviders } from '../../../testing/testUtils';
import { useCanEditDataApp } from '../hooks/useCanEditDataApp';
import AppHeaderActions from './AppHeaderActions';

vi.mock('react-router', () => ({
    useNavigate: () => vi.fn(),
}));
vi.mock('../hooks/useCanEditDataApp', () => ({
    useCanEditDataApp: vi.fn(),
}));
vi.mock('../hooks/useCanCreateDataApp', () => ({
    useCanCreateDataApp: vi.fn(() => false),
}));
vi.mock('../hooks/useAppThumbnail', () => ({
    useAppThumbnailUrl: vi.fn(() => ({ data: undefined, isError: false })),
    useAppThumbnailDelete: vi.fn(() => ({
        mutateAsync: vi.fn(),
        isLoading: false,
    })),
}));
vi.mock('../hooks/useDuplicateApp', () => ({
    useDuplicateApp: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })),
}));
vi.mock('../hooks/useUpgradeApp', () => ({
    useUpgradeApp: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })),
}));
vi.mock('../../../hooks/useProject', () => ({
    useProject: vi.fn(() => ({ data: undefined })),
}));
// Neither modal opens during these tests (nothing clicks their triggers) —
// stubbed only so their own heavy dependency trees never mount.
vi.mock('../../scheduler/components/SchedulerModals', () => ({
    AppSchedulersModal: () => null,
}));
vi.mock('../../sync/components', () => ({
    AppSyncModal: () => null,
}));

const mockedCanEdit = vi.mocked(useCanEditDataApp);

// Matches AppProviderMock's default user fixture (mockUserResponse) —
// hardcoded rather than imported to avoid pulling in a __mocks__ file.
const DEFAULT_ORG_UUID = '172a2270-000f-42be-9c68-c4752c23ae51';

// AppProviderMock shallow-merges this into its full default HealthState, so a
// partial `auth` (cast — AppHeaderActions only reads .auth.google) is enough.
const withGoogleDriveConfigured = (): Partial<HealthState> => ({
    auth: {
        google: {
            oauth2ClientId: 'client-id',
            googleDriveApiKey: 'api-key',
        },
    } as HealthState['auth'],
});

const withGoogleDriveNotConfigured = (): Partial<HealthState> => ({
    auth: {
        google: {
            oauth2ClientId: undefined,
            googleDriveApiKey: undefined,
        },
    } as HealthState['auth'],
});

// `Can` reads the module-level `defaultAbility` singleton (via AbilityContext,
// whose default value IS that singleton) — not AppProviderMock's `user.data`.
// In the real app `PrivateRoute` calls `ability.update(user.abilityRules)` on
// this same instance; tests must do the same instead of passing abilityRules
// through renderWithProviders' `user` mock, which `Can` never reads.
const grantGoogleSheetsAbility = () => {
    defaultAbility.update([
        {
            action: 'manage',
            subject: 'GoogleSheets',
            conditions: { organizationUuid: DEFAULT_ORG_UUID },
        },
    ]);
};

const withScheduledDeliveryPermission = () => ({
    abilityRules: [
        {
            action: 'create' as const,
            subject: 'ScheduledDeliveries' as const,
            conditions: {
                organizationUuid: DEFAULT_ORG_UUID,
                projectUuid: 'project-1',
            },
        },
    ],
});

const baseProps = {
    projectUuid: 'project-1',
    appUuid: 'app-1',
    appName: 'My app',
    appDescription: null,
    appSpaceUuid: null,
    appCreatedByUserUuid: null,
    latestVersionNumber: 1,
    latestVersionStatus: 'ready' as const,
    onRefresh: vi.fn(),
    refreshDisabled: false,
    onViewNetwork: vi.fn(),
    onDeleted: vi.fn(),
    onEdit: null,
    shareUrl: null,
    navItem: null,
    askAiItem: null,
    fullscreenToggle: null,
    captureThumbnail: null,
    capturePreviewScreenshot: null,
    upgrade: null,
};

const openMenu = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'App actions' }));
};

describe('AppHeaderActions — Google Sheets Sync entry point', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedCanEdit.mockReturnValue(true);
        defaultAbility.update([]);
    });

    afterEach(() => {
        defaultAbility.update([]);
    });

    it('shows delivery actions without edit access when their permissions are granted', async () => {
        mockedCanEdit.mockReturnValue(false);
        grantGoogleSheetsAbility();
        renderWithProviders(<AppHeaderActions {...baseProps} />, {
            health: withGoogleDriveConfigured(),
            user: withScheduledDeliveryPermission(),
        });

        await openMenu();

        // The gate reads an async health query — findBy polls until it has
        // resolved instead of racing the first render.
        expect(
            await screen.findByText('Google Sheets Sync'),
        ).toBeInTheDocument();
        expect(screen.getByText('Schedule delivery')).toBeInTheDocument();
    });

    it('hides the entry when Google Drive is not configured, but keeps Schedule delivery', async () => {
        grantGoogleSheetsAbility();
        renderWithProviders(<AppHeaderActions {...baseProps} />, {
            health: withGoogleDriveNotConfigured(),
            user: withScheduledDeliveryPermission(),
        });

        await openMenu();
        // Wait for the async health query to settle before asserting absence.
        await screen.findByText('Schedule delivery');

        expect(
            screen.queryByText('Google Sheets Sync'),
        ).not.toBeInTheDocument();
    });

    it('hides the entry when the GoogleSheets ability is not granted', async () => {
        // No grantGoogleSheetsAbility() call — defaultAbility stays empty.
        renderWithProviders(<AppHeaderActions {...baseProps} />, {
            health: withGoogleDriveConfigured(),
            user: withScheduledDeliveryPermission(),
        });

        await openMenu();
        await screen.findByText('Schedule delivery');

        expect(
            screen.queryByText('Google Sheets Sync'),
        ).not.toBeInTheDocument();
    });

    it('hides delivery actions when ScheduledDeliveries is not granted', async () => {
        mockedCanEdit.mockReturnValue(false);
        grantGoogleSheetsAbility();

        renderWithProviders(<AppHeaderActions {...baseProps} />, {
            health: withGoogleDriveConfigured(),
        });

        await openMenu();
        await screen.findByText('View network');

        expect(screen.queryByText('Schedule delivery')).not.toBeInTheDocument();
        expect(
            screen.queryByText('Google Sheets Sync'),
        ).not.toBeInTheDocument();
    });
});
