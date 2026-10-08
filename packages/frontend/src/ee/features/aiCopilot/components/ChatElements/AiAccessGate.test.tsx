import {
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    type AiAccessForUser,
} from '@lightdash/common';
import { rem, Text } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../../../../api';
import { aiAccessApi } from '../../../../../features/aiAccess/api';
import { useAiAccessGate } from '../../../../../features/aiAccess/useAiAccessGate';
import { useUserWarehouseCredentialsDeleteMutation } from '../../../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { AiAccessGate } from './AiAccessGate';

const flag = vi.hoisted(() => ({ enabled: true, isLoading: false }));
const composerRender = vi.fn();

vi.mock('../../../../../providers/App/useApp', () => ({
    default: () => ({
        health: { data: undefined },
        user: {
            data: { organizationUuid: 'org-1', ability: { can: () => false } },
        },
    }),
}));

vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: flag.isLoading ? undefined : { enabled: flag.enabled },
        isLoading: flag.isLoading,
    }),
}));
vi.mock('../../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastApiError: vi.fn(), showToastSuccess: vi.fn() }),
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
    connectUrl: null,
};
const accessError = { error: { message: 'Access check failed' } };
const accessResult = (refused: boolean) =>
    ({ refusal: refused ? refusal : null }) as AiAccessForUser;

const Composer = () => {
    composerRender();
    return <Text>Composer</Text>;
};

const Gate = () => {
    const access = useAiAccessGate('project-1');
    return (
        <AiAccessGate projectUuid="project-1" variant="card" {...access}>
            <Composer />
        </AiAccessGate>
    );
};

const renderGate = () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, cacheTime: 0 } },
    });
    const content = () => (
        <QueryClientProvider client={client}>
            <Gate />
        </QueryClientProvider>
    );
    const view = renderWithProviders(content());
    return { ...view, client, rerenderGate: () => view.rerender(content()) };
};

const DisconnectThenOpen = () => {
    const [open, setOpen] = useState(false);
    const disconnect =
        useUserWarehouseCredentialsDeleteMutation('credential-1');
    return (
        <>
            <button onClick={() => disconnect.mutate()}>Disconnect</button>
            <button
                disabled={!disconnect.isSuccess}
                onClick={() => setOpen(true)}
            >
                Open chat
            </button>
            {open && <Gate />}
        </>
    );
};

describe('AiAccessGate', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        composerRender.mockClear();
        localStorage.clear();
        flag.enabled = true;
        flag.isLoading = false;
    });

    describe.each([
        { variant: 'card' as const, minHeight: 260 },
        { variant: 'inline' as const, minHeight: 160 },
    ])('$variant layout', ({ variant, minHeight }) => {
        it('renders allowed children directly in the parent container', () => {
            const { container } = renderWithProviders(
                <AiAccessGate
                    projectUuid="project-1"
                    variant={variant}
                    refusal={null}
                    isLoading={false}
                    isError={false}
                    refetch={vi.fn()}
                >
                    <Composer />
                    <Text>Suggestions</Text>
                </AiAccessGate>,
            );

            expect(screen.getByText('Composer').parentElement).toBe(container);
            expect(screen.getByText('Suggestions').parentElement).toBe(
                container,
            );
        });

        it('reserves the variant height on the loading placeholder', () => {
            renderWithProviders(
                <AiAccessGate
                    projectUuid="project-1"
                    variant={variant}
                    refusal={undefined}
                    isLoading
                    isError={false}
                    refetch={vi.fn()}
                >
                    <Composer />
                </AiAccessGate>,
            );

            expect(
                screen.getByTestId('ai-access-placeholder').style.minHeight,
            ).toBe(rem(minHeight));
        });

        it.each(['refusal', 'error'] as const)(
            'preserves the reserved height when loading resolves to %s',
            (outcome) => {
                const props = {
                    projectUuid: 'project-1',
                    variant,
                    refetch: vi.fn(),
                };
                const { rerender } = renderWithProviders(
                    <AiAccessGate
                        {...props}
                        refusal={undefined}
                        isLoading
                        isError={false}
                    >
                        <Composer />
                    </AiAccessGate>,
                );
                const placeholderHeight = screen.getByTestId(
                    'ai-access-placeholder',
                ).style.minHeight;

                rerender(
                    <AiAccessGate
                        {...props}
                        refusal={outcome === 'refusal' ? refusal : undefined}
                        isLoading={false}
                        isError={outcome === 'error'}
                    >
                        <Composer />
                    </AiAccessGate>,
                );

                const button = screen.getByRole('button', {
                    name: outcome === 'refusal' ? 'Connect agent' : 'Try again',
                });
                const reservedSpace = button.closest(
                    '.mantine-Paper-root',
                )?.parentElement;
                expect(reservedSpace?.style.minHeight).toBe(placeholderHeight);
                expect(reservedSpace?.style.minHeight).toBe(rem(minHeight));
                expect(
                    screen.queryByTestId('ai-access-placeholder'),
                ).not.toBeInTheDocument();
                expect(screen.queryByText('Composer')).not.toBeInTheDocument();
            },
        );
    });

    it('holds an idle query without access data', () => {
        renderWithProviders(
            <AiAccessGate
                projectUuid="project-1"
                variant="card"
                refusal={undefined}
                isLoading={false}
                isError={false}
                refetch={vi.fn()}
            >
                <Composer />
            </AiAccessGate>,
        );
        expect(screen.getByTestId('ai-access-placeholder')).toBeVisible();
        expect(composerRender).not.toHaveBeenCalled();
    });

    it('holds a cold load through disabled then enabled access without rendering the composer', async () => {
        flag.isLoading = true;
        let resolveAccess!: (value: AiAccessForUser) => void;
        const me = vi.spyOn(aiAccessApi, 'me').mockReturnValue(
            new Promise((resolve) => {
                resolveAccess = resolve;
            }),
        );
        const { rerenderGate } = renderGate();
        expect(screen.getByTestId('ai-access-placeholder')).toBeInTheDocument();
        expect(me).not.toHaveBeenCalled();
        flag.isLoading = false;
        rerenderGate();
        expect(screen.getByTestId('ai-access-placeholder')).toBeInTheDocument();
        await act(async () => resolveAccess(accessResult(true)));
        expect(
            await screen.findByRole('button', { name: 'Connect agent' }),
        ).toBeEnabled();
        expect(composerRender).not.toHaveBeenCalled();
    });

    it('holds while the flag loads, then renders the composer when it is off', () => {
        flag.isLoading = true;
        const me = vi.spyOn(aiAccessApi, 'me');
        const { rerenderGate } = renderGate();
        expect(screen.getByTestId('ai-access-placeholder')).toBeInTheDocument();
        flag.isLoading = false;
        flag.enabled = false;
        rerenderGate();
        expect(screen.getByText('Composer')).toBeVisible();
        expect(
            screen.queryByTestId('ai-access-placeholder'),
        ).not.toBeInTheDocument();
        expect(me).not.toHaveBeenCalled();
    });

    it('holds the gate while previously allowed access refetches', async () => {
        const me = vi
            .spyOn(aiAccessApi, 'me')
            .mockResolvedValue(accessResult(false));
        const { client } = renderGate();
        await screen.findByText('Composer');
        composerRender.mockClear();
        let resolveAccess!: (value: AiAccessForUser) => void;
        me.mockReturnValue(
            new Promise((resolve) => {
                resolveAccess = resolve;
            }),
        );
        act(() => {
            void client.invalidateQueries(['ai-access']);
        });
        await screen.findByTestId('ai-access-placeholder');
        expect(screen.queryByText('Composer')).not.toBeInTheDocument();
        await act(async () => resolveAccess(accessResult(true)));
        expect(
            await screen.findByRole('button', { name: 'Connect agent' }),
        ).toBeEnabled();
        expect(composerRender).not.toHaveBeenCalled();
    });

    it('opens after disconnect with stale allowed access without rendering the composer', async () => {
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
        });
        client.setQueryData(
            ['ai-access', 'project-1', null, 'me'],
            accessResult(false),
        );
        const deleteRequest = vi
            .spyOn(api, 'lightdashApi')
            .mockResolvedValue(null);
        let resolveAccess!: (value: AiAccessForUser) => void;
        vi.spyOn(aiAccessApi, 'me').mockReturnValue(
            new Promise((resolve) => {
                resolveAccess = resolve;
            }),
        );
        renderWithProviders(
            <QueryClientProvider client={client}>
                <DisconnectThenOpen />
            </QueryClientProvider>,
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Disconnect' }),
        );
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Open chat' }),
            ).toBeEnabled(),
        );
        expect(deleteRequest).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/user/warehouseCredentials/credential-1',
                method: 'DELETE',
            }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Open chat' }),
        );
        expect(screen.getByTestId('ai-access-placeholder')).toBeInTheDocument();
        await act(async () => resolveAccess(accessResult(true)));
        expect(
            await screen.findByRole('button', { name: 'Connect agent' }),
        ).toBeEnabled();
        expect(composerRender).not.toHaveBeenCalled();
    });

    it('renders children immediately when the flag is off', () => {
        flag.enabled = false;
        const me = vi.spyOn(aiAccessApi, 'me');
        renderGate();
        expect(screen.getByText('Composer')).toBeVisible();
        expect(
            screen.queryByTestId('ai-access-placeholder'),
        ).not.toBeInTheDocument();
        expect(me).not.toHaveBeenCalled();
    });

    it('shows the placeholder while enabled access loads, then the refusal', async () => {
        let resolveAccess!: (value: AiAccessForUser) => void;
        vi.spyOn(aiAccessApi, 'me').mockReturnValue(
            new Promise((resolve) => {
                resolveAccess = resolve;
            }),
        );
        renderGate();
        expect(screen.getByTestId('ai-access-placeholder')).toBeInTheDocument();
        expect(screen.queryByText('Composer')).not.toBeInTheDocument();
        await act(async () => resolveAccess(accessResult(true)));
        expect(
            await screen.findByRole('button', { name: 'Connect agent' }),
        ).toBeEnabled();
        expect(
            screen.queryByTestId('ai-access-placeholder'),
        ).not.toBeInTheDocument();
    });

    it('renders children when the flag turns off during a retry', async () => {
        const me = vi.spyOn(aiAccessApi, 'me').mockRejectedValue(accessError);
        const { rerenderGate } = renderGate();
        const retry = await screen.findByRole('button', { name: 'Try again' });
        let resolveRetry!: (value: AiAccessForUser) => void;
        me.mockReturnValue(
            new Promise((resolve) => {
                resolveRetry = resolve;
            }),
        );
        await userEvent.click(retry);
        flag.enabled = false;
        rerenderGate();
        expect(screen.getByText('Composer')).toBeVisible();
        await act(async () => resolveRetry(accessResult(true)));
        expect(screen.getByText('Composer')).toBeVisible();
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
