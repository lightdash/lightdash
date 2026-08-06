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
                    deepResearchLimits: {
                        maxTokens: 10_000_000,
                        maxToolCalls: 24,
                        maxWarehouseQueries: 15,
                        maxSteps: 16,
                        deadlineMs: 600_000,
                    },
                } as
                    | {
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
    useAiOrganizationSettings: () => ({
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

    it('updates one organization limit while preserving the others', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <MemoryRouter>
                <AiDeepResearchSettingsPage />
            </MemoryRouter>,
        );

        const updateButtons = screen.getAllByRole('button', { name: 'Update' });
        expect(updateButtons).toHaveLength(5);
        updateButtons.forEach((button) => expect(button).toBeDisabled());

        // "Maximum tokens" is the last limit field on the page.
        const editedIndex = updateButtons.length - 1;
        fireEvent.change(
            screen.getByRole('textbox', { name: 'Maximum tokens' }),
            { target: { value: '9000000' } },
        );

        updateButtons.forEach((button, index) =>
            index === editedIndex
                ? expect(button).toBeEnabled()
                : expect(button).toBeDisabled(),
        );

        updateSettings.mockImplementation(() => {
            mutationState.current.isLoading = true;
        });
        await user.click(updateButtons[editedIndex]);

        updateButtons.forEach((button, index) =>
            index === editedIndex
                ? expect(button).toHaveAttribute('data-loading')
                : expect(button).not.toHaveAttribute('data-loading'),
        );

        expect(updateSettings).toHaveBeenCalledWith({
            deepResearchLimits: {
                maxTokens: 9_000_000,
                maxToolCalls: 24,
                maxWarehouseQueries: 15,
                maxSteps: 16,
                deadlineMs: 600_000,
            },
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
