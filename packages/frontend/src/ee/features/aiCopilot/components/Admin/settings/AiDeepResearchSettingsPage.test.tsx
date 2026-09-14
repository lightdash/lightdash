import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { AiDeepResearchSettingsPage } from './AiDeepResearchSettingsPage';

const { mutationState, refetchSettings, settingsQuery, updateSettings } =
    vi.hoisted(() => ({
        mutationState: { current: { isLoading: false } },
        refetchSettings: vi.fn(),
        settingsQuery: {
            current: {
                data: {
                    deepResearchRawSqlEnabled: false,
                    deepResearchLimits: {
                        maxTokens: 10_000_000,
                        maxToolCalls: 24,
                        maxWarehouseQueries: 15,
                        maxSteps: 16,
                        deadlineMs: 600_000,
                    },
                } as
                    | {
                          deepResearchRawSqlEnabled: boolean;
                          deepResearchLimits: {
                              maxTokens: number;
                              maxToolCalls: number;
                              maxWarehouseQueries: number;
                              maxSteps: number;
                              deadlineMs: number;
                          };
                      }
                    | undefined,
                isInitialLoading: false,
                isError: false,
                error: undefined as
                    | {
                          error: {
                              name: string;
                              message: string;
                              statusCode: number;
                          };
                      }
                    | undefined,
            },
        },
        updateSettings: vi.fn(),
    }));

vi.mock('../../../hooks/useAiOrganizationSettings', () => ({
    useAiOrganizationAdminSettings: () => ({
        ...settingsQuery.current,
        refetch: refetchSettings,
    }),
    useUpdateAiOrganizationSettings: () => ({
        mutate: updateSettings,
        isLoading: mutationState.current.isLoading,
    }),
}));

describe('AiDeepResearchSettingsPage', () => {
    beforeEach(() => {
        settingsQuery.current = {
            data: {
                deepResearchRawSqlEnabled: false,
                deepResearchLimits: {
                    maxTokens: 10_000_000,
                    maxToolCalls: 24,
                    maxWarehouseQueries: 15,
                    maxSteps: 16,
                    deadlineMs: 600_000,
                },
            },
            isInitialLoading: false,
            isError: false,
            error: undefined,
        };
        refetchSettings.mockReset();
        updateSettings.mockReset();
        mutationState.current.isLoading = false;
    });

    it('labels the settings page as beta exactly once', () => {
        renderWithProviders(
            <MemoryRouter>
                <AiDeepResearchSettingsPage />
            </MemoryRouter>,
        );

        expect(screen.getAllByText('Beta')).toHaveLength(1);
    });

    it('saves all limits with a single update button', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <MemoryRouter>
                <AiDeepResearchSettingsPage />
            </MemoryRouter>,
        );

        const updateButton = screen.getByRole('button', { name: 'Update' });
        expect(updateButton).toBeDisabled();

        fireEvent.change(
            screen.getByRole('textbox', { name: 'Maximum tokens' }),
            { target: { value: '9000000' } },
        );
        // The time limit is edited in minutes and stored in milliseconds.
        fireEvent.change(
            screen.getByRole('textbox', { name: 'Time limit (minutes)' }),
            { target: { value: '12' } },
        );

        expect(updateButton).toBeEnabled();

        updateSettings.mockImplementation(() => {
            mutationState.current.isLoading = true;
        });
        await user.click(updateButton);

        expect(updateButton).toHaveAttribute('data-loading');
        expect(updateSettings).toHaveBeenCalledWith({
            deepResearchLimits: {
                maxTokens: 9_000_000,
                maxToolCalls: 24,
                maxWarehouseQueries: 15,
                maxSteps: 16,
                deadlineMs: 720_000,
            },
        });
    });

    it('resets edits with the cancel button', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <MemoryRouter>
                <AiDeepResearchSettingsPage />
            </MemoryRouter>,
        );

        expect(
            screen.queryByRole('button', { name: 'Cancel' }),
        ).not.toBeInTheDocument();

        const stepsInput = screen.getByRole('textbox', {
            name: 'Maximum steps',
        });
        fireEvent.change(stepsInput, { target: { value: '20' } });

        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(stepsInput).toHaveValue('16');
        expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled();
        expect(updateSettings).not.toHaveBeenCalled();
    });

    it('enables raw SQL for Deep Research', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <MemoryRouter>
                <AiDeepResearchSettingsPage />
            </MemoryRouter>,
        );

        await user.click(screen.getByRole('switch', { name: 'Allow raw SQL' }));

        expect(updateSettings).toHaveBeenCalledWith({
            deepResearchRawSqlEnabled: true,
        });
    });

    it('shows the query error and allows retrying', async () => {
        const user = userEvent.setup();
        settingsQuery.current = {
            data: undefined,
            isInitialLoading: false,
            isError: true,
            error: {
                error: {
                    name: 'NetworkError',
                    message: 'Could not load deep research settings',
                    statusCode: 500,
                },
            },
        };

        renderWithProviders(
            <MemoryRouter>
                <AiDeepResearchSettingsPage />
            </MemoryRouter>,
        );

        expect(
            screen.getByText('Could not load deep research settings'),
        ).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Try again' }));
        expect(refetchSettings).toHaveBeenCalledOnce();
    });
});
