import {
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    type AiAccessForUser,
} from '@lightdash/common';
import { Text } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aiAccessApi } from '../../../../../features/aiAccess/api';
import { useAiAccessGate } from '../../../../../features/aiAccess/useAiAccessGate';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { AiAccessGate } from './AiAccessGate';

vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: true },
        isLoading: false,
    }),
}));
vi.mock('../../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastApiError: vi.fn() }),
}));
vi.mock('../../../../providers/Embed/useUiStrings', () => ({
    useUiStrings: () => (key: string) => key,
}));
vi.mock('../../../../../hooks/useSnowflake', () => ({
    useSnowflakeAiLoginPopup: () => ({
        mutate: vi.fn(),
        isLoading: false,
        error: null,
    }),
}));

const refusal = {
    code: 'ai_access_refused' as const,
    reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
    action: AiAccessRefusalAction.SIGN_IN,
    message: 'Sign in to run agent queries.',
    settingsUrl: null,
};
const accessError = { error: { message: 'Access check failed' } };
const accessResult = (refused: boolean) =>
    ({ refusal: refused ? refusal : null }) as AiAccessForUser;

const Gate = () => {
    const access = useAiAccessGate('project-1');
    return (
        <AiAccessGate projectUuid="project-1" variant="card" {...access}>
            <Text>Composer</Text>
        </AiAccessGate>
    );
};

const renderGate = () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, cacheTime: 0 } },
    });
    return renderWithProviders(
        <QueryClientProvider client={client}>
            <Gate />
        </QueryClientProvider>,
    );
};

describe('AiAccessGate', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('shows an error with a retry instead of its children', async () => {
        vi.spyOn(aiAccessApi, 'me').mockRejectedValue(accessError);
        renderGate();
        expect(
            await screen.findByText(/We could not check your agent connection/),
        ).toBeVisible();
        expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
        expect(screen.queryByText('Composer')).not.toBeInTheDocument();
    });

    it.each(['allowed', 'refused', 'error'])(
        'keeps the retry card while fetching and handles a %s result',
        async (outcome) => {
            const user = userEvent.setup();
            const me = vi
                .spyOn(aiAccessApi, 'me')
                .mockRejectedValue(accessError);
            renderGate();
            const retry = await screen.findByRole('button', {
                name: 'Try again',
            });
            let resolveRetry!: (result: AiAccessForUser) => void;
            let rejectRetry!: (error: typeof accessError) => void;
            me.mockReturnValue(
                new Promise((resolve, reject) => {
                    resolveRetry = resolve;
                    rejectRetry = reject;
                }),
            );
            await user.click(retry);
            expect(me).toHaveBeenCalledTimes(2);
            expect(retry).toBeDisabled();
            expect(retry).toHaveAttribute('data-loading', 'true');
            expect(
                screen.getByText(/We could not check your agent connection/),
            ).toBeVisible();
            expect(
                screen.queryByTestId('ai-access-placeholder'),
            ).not.toBeInTheDocument();
            expect(screen.queryByText('Composer')).not.toBeInTheDocument();
            await act(async () => {
                if (outcome === 'error') {
                    rejectRetry(accessError);
                } else {
                    resolveRetry(accessResult(outcome === 'refused'));
                }
            });
            if (outcome === 'allowed') {
                expect(await screen.findByText('Composer')).toBeVisible();
            } else if (outcome === 'refused') {
                expect(
                    await screen.findByRole('button', {
                        name: 'Connect agent',
                    }),
                ).toBeEnabled();
                expect(screen.queryByText('Composer')).not.toBeInTheDocument();
            } else {
                await waitFor(() =>
                    expect(
                        screen.getByRole('button', { name: 'Try again' }),
                    ).toBeEnabled(),
                );
                expect(
                    screen.getByText(
                        /We could not check your agent connection/,
                    ),
                ).toBeVisible();
                expect(screen.queryByText('Composer')).not.toBeInTheDocument();
            }
            if (outcome !== 'error') {
                expect(
                    screen.queryByRole('button', { name: 'Try again' }),
                ).not.toBeInTheDocument();
            }
        },
    );
});
