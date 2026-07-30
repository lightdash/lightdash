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
                        maxToolCalls: 1000,
                        maxWarehouseQueries: 100,
                        maxHypotheses: 5,
                    },
                } as
                    | {
                          deepResearchLimits: {
                              maxTokens: number;
                              maxToolCalls: number;
                              maxWarehouseQueries: number;
                              maxHypotheses: number;
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
                    maxToolCalls: 1000,
                    maxWarehouseQueries: 100,
                    maxHypotheses: 5,
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
        expect(updateButtons).toHaveLength(4);
        updateButtons.forEach((button) => expect(button).toBeDisabled());

        fireEvent.change(
            screen.getByRole('textbox', { name: 'Maximum tokens' }),
            { target: { value: '9000000' } },
        );

        expect(updateButtons[0]).toBeEnabled();
        expect(updateButtons[1]).toBeDisabled();
        expect(updateButtons[2]).toBeDisabled();
        expect(updateButtons[3]).toBeDisabled();

        updateSettings.mockImplementation(() => {
            mutationState.current.isLoading = true;
        });
        await user.click(updateButtons[0]);

        expect(updateButtons[0]).toHaveAttribute('data-loading');
        updateButtons
            .slice(1)
            .forEach((button) =>
                expect(button).not.toHaveAttribute('data-loading'),
            );

        expect(updateSettings).toHaveBeenCalledWith({
            deepResearchLimits: {
                maxTokens: 9_000_000,
                maxToolCalls: 1000,
                maxWarehouseQueries: 100,
                maxHypotheses: 5,
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
