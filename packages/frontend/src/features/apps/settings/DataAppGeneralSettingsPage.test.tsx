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
              'dataAppAutomaticThumbnailsEnabled' | 'dataAppCapturesEnabled'
          >
        | undefined;
    isInitialLoading: boolean;
    isError: boolean;
    error: ApiError | undefined;
};

const LABEL = 'Automatically capture thumbnails for data app versions';
const CAPTURES_LABEL = 'Allow screenshots and attachments in data app builds';

const {
    automaticThumbnailsFlag,
    health,
    mutationState,
    refetchSettings,
    settingsQuery,
    updateSettings,
} = vi.hoisted(() => {
    const settingsQuery: { current: SettingsQuery } = {
        current: {
            data: {
                dataAppAutomaticThumbnailsEnabled: true,
                dataAppCapturesEnabled: true,
            },
            isInitialLoading: false,
            isError: false,
            error: undefined,
        },
    };

    return {
        automaticThumbnailsFlag: { enabled: true },
        health: { hasHeadlessBrowser: true, capturesEnabledOnInstance: true },
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

vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: automaticThumbnailsFlag.enabled },
        isInitialLoading: false,
    }),
}));

vi.mock('../../../hooks/health/useHealth', () => ({
    default: () => ({
        data: {
            hasHeadlessBrowser: health.hasHeadlessBrowser,
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
            data: {
                dataAppAutomaticThumbnailsEnabled: true,
                dataAppCapturesEnabled: true,
            },
            isInitialLoading: false,
            isError: false,
            error: undefined,
        };
        health.hasHeadlessBrowser = true;
        health.capturesEnabledOnInstance = true;
        automaticThumbnailsFlag.enabled = true;
        mutationState.isLoading = false;
        refetchSettings.mockReset();
        updateSettings.mockReset();
    });

    it('shows automatic capture on for an organization that has it on', () => {
        renderPage();

        const checkbox = screen.getByRole('switch', { name: LABEL });
        expect(checkbox).toBeChecked();
        expect(checkbox).toBeEnabled();
        expect(
            screen.queryByText('No headless browser is configured'),
        ).not.toBeInTheDocument();
    });

    it('says that thumbnail text is blurred', () => {
        renderPage();

        expect(
            screen.getByText(/Text is blurred so values are not readable\./),
        ).toBeInTheDocument();
    });

    it('hides automatic capture when the feature flag is off', () => {
        automaticThumbnailsFlag.enabled = false;
        health.hasHeadlessBrowser = false;
        renderPage();

        expect(
            screen.queryByRole('switch', { name: LABEL }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('Automatically capture thumbnails'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('No headless browser is configured'),
        ).not.toBeInTheDocument();
    });

    it('turns automatic capture off when the checkbox is unticked', async () => {
        const user = userEvent.setup();
        renderPage();

        await user.click(screen.getByRole('switch', { name: LABEL }));

        expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
            dataAppAutomaticThumbnailsEnabled: false,
        });
    });

    it('turns automatic capture back on when the checkbox is ticked', async () => {
        const user = userEvent.setup();
        settingsQuery.current.data = {
            dataAppAutomaticThumbnailsEnabled: false,
            dataAppCapturesEnabled: true,
        };
        renderPage();

        const checkbox = screen.getByRole('switch', { name: LABEL });
        expect(checkbox).not.toBeChecked();
        await user.click(checkbox);

        expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
            dataAppAutomaticThumbnailsEnabled: true,
        });
    });

    it('disables the checkbox while a change is being saved', () => {
        mutationState.isLoading = true;
        renderPage();

        expect(screen.getByRole('switch', { name: LABEL })).toBeDisabled();
    });

    it('disables the checkbox and explains why when no headless browser is configured', () => {
        health.hasHeadlessBrowser = false;
        renderPage();

        expect(screen.getByRole('switch', { name: LABEL })).toBeDisabled();
        expect(
            screen.getByText('No headless browser is configured'),
        ).toBeInTheDocument();
    });

    describe('screenshots and attachments', () => {
        it('is on, and shown even when automatic thumbnails are not available', () => {
            automaticThumbnailsFlag.enabled = false;
            renderPage();

            const toggle = screen.getByRole('switch', { name: CAPTURES_LABEL });
            expect(toggle).toBeChecked();
            expect(toggle).toBeEnabled();
            expect(
                screen.queryByRole('switch', { name: LABEL }),
            ).not.toBeInTheDocument();
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

        it('locks automatic thumbnails off while captures are off', () => {
            settingsQuery.current.data = {
                dataAppCapturesEnabled: false,
                // The API resolves this to false while captures are off.
                dataAppAutomaticThumbnailsEnabled: false,
            };
            renderPage();

            expect(
                screen.getByRole('switch', { name: CAPTURES_LABEL }),
            ).not.toBeChecked();
            const thumbnails = screen.getByRole('switch', { name: LABEL });
            expect(thumbnails).not.toBeChecked();
            expect(thumbnails).toBeDisabled();
            expect(
                screen.getByText(
                    'Off while screenshots and attachments are not allowed.',
                ),
            ).toBeInTheDocument();
        });

        it('cannot be turned on when the instance env has captures off', () => {
            health.capturesEnabledOnInstance = false;
            settingsQuery.current.data = {
                dataAppCapturesEnabled: false,
                dataAppAutomaticThumbnailsEnabled: false,
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
