import { type ApiError, type OrganizationSettings } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { DataAppGeneralSettingsPage } from './DataAppGeneralSettingsPage';

type SettingsQuery = {
    data:
        | Pick<OrganizationSettings, 'dataAppAutomaticThumbnailsEnabled'>
        | undefined;
    isInitialLoading: boolean;
    isError: boolean;
    error: ApiError | undefined;
};

const LABEL = 'Automatically capture thumbnails for data app versions';

const {
    health,
    mutationState,
    refetchSettings,
    settingsQuery,
    updateSettings,
} = vi.hoisted(() => {
    const settingsQuery: { current: SettingsQuery } = {
        current: {
            data: { dataAppAutomaticThumbnailsEnabled: true },
            isInitialLoading: false,
            isError: false,
            error: undefined,
        },
    };

    return {
        health: { hasHeadlessBrowser: true },
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

vi.mock('../../../hooks/health/useHealth', () => ({
    default: () => ({
        data: { hasHeadlessBrowser: health.hasHeadlessBrowser },
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
            data: { dataAppAutomaticThumbnailsEnabled: true },
            isInitialLoading: false,
            isError: false,
            error: undefined,
        };
        health.hasHeadlessBrowser = true;
        mutationState.isLoading = false;
        refetchSettings.mockReset();
        updateSettings.mockReset();
    });

    it('shows automatic capture on for an organization that has it on', () => {
        renderPage();

        const checkbox = screen.getByRole('checkbox', { name: LABEL });
        expect(checkbox).toBeChecked();
        expect(checkbox).toBeEnabled();
        expect(
            screen.queryByText('No headless browser is configured'),
        ).not.toBeInTheDocument();
    });

    it('turns automatic capture off when the checkbox is unticked', async () => {
        const user = userEvent.setup();
        renderPage();

        await user.click(screen.getByRole('checkbox', { name: LABEL }));

        expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
            dataAppAutomaticThumbnailsEnabled: false,
        });
    });

    it('turns automatic capture back on when the checkbox is ticked', async () => {
        const user = userEvent.setup();
        settingsQuery.current.data = {
            dataAppAutomaticThumbnailsEnabled: false,
        };
        renderPage();

        const checkbox = screen.getByRole('checkbox', { name: LABEL });
        expect(checkbox).not.toBeChecked();
        await user.click(checkbox);

        expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
            dataAppAutomaticThumbnailsEnabled: true,
        });
    });

    it('disables the checkbox while a change is being saved', () => {
        mutationState.isLoading = true;
        renderPage();

        expect(screen.getByRole('checkbox', { name: LABEL })).toBeDisabled();
    });

    it('disables the checkbox and explains why when no headless browser is configured', () => {
        health.hasHeadlessBrowser = false;
        renderPage();

        expect(screen.getByRole('checkbox', { name: LABEL })).toBeDisabled();
        expect(
            screen.getByText('No headless browser is configured'),
        ).toBeInTheDocument();
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
