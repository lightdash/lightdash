import { type ApiError, type OrganizationSettings } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { DataAppGeneralSettingsPage } from './DataAppGeneralSettingsPage';

type SettingsQuery = {
    data:
        | Pick<
              OrganizationSettings,
              'dataAppCapturesEnabled' | 'dataAppCustomDependenciesEnabled'
          >
        | undefined;
    isInitialLoading: boolean;
    isError: boolean;
    error: ApiError | undefined;
};

const CAPTURES_LABEL = 'Allow screenshots and attachments in data app builds';
const CUSTOM_DEPENDENCIES_LABEL = 'Allow custom dependencies in data apps';

const DEFAULT_SETTINGS = {
    dataAppCapturesEnabled: true,
    dataAppCustomDependenciesEnabled: false,
};

const {
    aiSettings,
    health,
    mutationState,
    refetchSettings,
    settingsQuery,
    updateSettings,
} = vi.hoisted(() => {
    const settingsQuery: { current: SettingsQuery } = {
        current: {
            data: {
                dataAppCapturesEnabled: true,
                dataAppCustomDependenciesEnabled: false,
            },
            isInitialLoading: false,
            isError: false,
            error: undefined,
        },
    };

    return {
        aiSettings: {
            current: { isCopilotEnabled: true, isTrial: false } as {
                isCopilotEnabled: boolean;
                isTrial: boolean;
            },
        },
        health: { capturesEnabledOnInstance: true },
        mutationState: { isLoading: false },
        refetchSettings: vi.fn(),
        settingsQuery,
        updateSettings: vi.fn(),
    };
});

vi.mock('../../../hooks/organization/useOrganizationSettings', () => ({
    useOrganizationSettings: () => ({
        ...settingsQuery.current,
        refetch: refetchSettings,
    }),
    useUpdateOrganizationSettings: () => ({
        mutate: updateSettings,
        isLoading: mutationState.isLoading,
    }),
}));

vi.mock(
    '../../../ee/features/aiCopilot/hooks/useAiOrganizationSettings',
    () => ({
        useAiOrganizationSettings: () => ({ data: aiSettings.current }),
    }),
);

vi.mock('../../../hooks/health/useHealth', () => ({
    default: () => ({
        data: {
            dataApps: { capturesEnabled: health.capturesEnabledOnInstance },
        },
        isInitialLoading: false,
    }),
}));

const renderPage = () =>
    renderWithProviders(
        <MemoryRouter>
            <DataAppGeneralSettingsPage />
        </MemoryRouter>,
    );

describe('DataAppGeneralSettingsPage', () => {
    beforeEach(() => {
        settingsQuery.current = {
            data: DEFAULT_SETTINGS,
            isInitialLoading: false,
            isError: false,
            error: undefined,
        };
        health.capturesEnabledOnInstance = true;
        mutationState.isLoading = false;
        refetchSettings.mockReset();
        updateSettings.mockReset();
    });

    describe('screenshots and attachments', () => {
        it('is on for an organization that has never changed it', () => {
            renderPage();

            const toggle = screen.getByRole('switch', { name: CAPTURES_LABEL });
            expect(toggle).toBeChecked();
            expect(toggle).toBeEnabled();
        });

        it('offers no automatic thumbnail control', () => {
            renderPage();

            expect(screen.getAllByRole('switch')).toHaveLength(2);
            expect(screen.queryByText(/automatic/i)).not.toBeInTheDocument();
        });

        it('turns captures off when unticked', async () => {
            const user = userEvent.setup();
            renderPage();

            await user.click(
                screen.getByRole('switch', { name: CAPTURES_LABEL }),
            );

            expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
                dataAppCapturesEnabled: false,
            });
        });

        it('turns captures back on when ticked', async () => {
            const user = userEvent.setup();
            settingsQuery.current.data = {
                ...DEFAULT_SETTINGS,
                dataAppCapturesEnabled: false,
            };
            renderPage();

            const toggle = screen.getByRole('switch', { name: CAPTURES_LABEL });
            expect(toggle).not.toBeChecked();
            await user.click(toggle);

            expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
                dataAppCapturesEnabled: true,
            });
        });

        it('is disabled while a change is being saved', () => {
            mutationState.isLoading = true;
            renderPage();

            expect(
                screen.getByRole('switch', { name: CAPTURES_LABEL }),
            ).toBeDisabled();
        });

        it('cannot be turned on when the instance env has captures off', () => {
            health.capturesEnabledOnInstance = false;
            settingsQuery.current.data = {
                ...DEFAULT_SETTINGS,
                dataAppCapturesEnabled: false,
            };
            renderPage();

            const toggle = screen.getByRole('switch', { name: CAPTURES_LABEL });
            expect(toggle).not.toBeChecked();
            expect(toggle).toBeDisabled();
            expect(
                screen.getByText(
                    'Screenshots and attachments are disabled on this instance',
                ),
            ).toBeInTheDocument();
        });
    });

    describe('custom dependencies', () => {
        it('is off by default and can be turned on', async () => {
            const user = userEvent.setup();
            renderPage();

            const toggle = screen.getByRole('switch', {
                name: CUSTOM_DEPENDENCIES_LABEL,
            });
            expect(toggle).not.toBeChecked();
            expect(
                screen.getByText('manage:DataAppDependency'),
            ).toBeInTheDocument();
            await user.click(toggle);

            expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
                dataAppCustomDependenciesEnabled: true,
            });
        });

        it('turns off when unticked', async () => {
            const user = userEvent.setup();
            settingsQuery.current.data = {
                ...DEFAULT_SETTINGS,
                dataAppCustomDependenciesEnabled: true,
            };
            renderPage();

            await user.click(
                screen.getByRole('switch', { name: CUSTOM_DEPENDENCIES_LABEL }),
            );

            expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
                dataAppCustomDependenciesEnabled: false,
            });
        });
    });

    it('shows a settings error and allows retrying', async () => {
        const user = userEvent.setup();
        settingsQuery.current = {
            data: undefined,
            isInitialLoading: false,
            isError: true,
            error: {
                status: 'error',
                error: {
                    name: 'NetworkError',
                    message: 'Could not load organization settings',
                    statusCode: 500,
                    data: {},
                },
            },
        };
        renderPage();

        expect(
            screen.getByText('Could not load organization settings'),
        ).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Try again' }));

        expect(refetchSettings).toHaveBeenCalledOnce();
    });
});

describe('AI analysis link', () => {
    beforeEach(() => {
        settingsQuery.current = {
            data: DEFAULT_SETTINGS,
            isInitialLoading: false,
            isError: false,
            error: undefined,
        };
    });

    it.each([
        ['AI enabled', { isCopilotEnabled: true, isTrial: false }],
        ['AI trial', { isCopilotEnabled: false, isTrial: true }],
    ])('links to the AI analysis settings with %s', (_, current) => {
        aiSettings.current = current;
        renderPage();
        expect(
            screen.getByRole('link', { name: 'Ask AI · AI analysis' }),
        ).toHaveAttribute('href', '/generalSettings/ai/analysis');
    });

    it('hides the link without AI, where the page does not exist', () => {
        aiSettings.current = { isCopilotEnabled: false, isTrial: false };
        renderPage();
        expect(
            screen.queryByRole('link', { name: 'Ask AI · AI analysis' }),
        ).not.toBeInTheDocument();
    });
});
