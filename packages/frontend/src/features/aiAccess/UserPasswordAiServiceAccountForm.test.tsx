import {
    WarehouseTypes,
    type AiServiceAccountSlot,
    type AiServiceAccountTestResult,
    type ApiAiServiceAccountSaveResponse,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi, lightdashApiResponse } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import { AiServiceAccountForm } from './AiServiceAccountForm';

vi.mock('../../api', () => ({
    lightdashApi: vi.fn(),
    lightdashApiResponse: vi.fn(),
}));
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: vi.fn(), showToastApiError: vi.fn() }),
}));
const verification: AiServiceAccountTestResult = {
    ok: true,
    principal: 'verified-principal',
    observed: { currentUser: 'verified-principal' },
    message: 'Connection works.',
    checkedAt: new Date('2026-10-09T12:00:00Z'),
};
describe.each([
    [WarehouseTypes.POSTGRES, 'The Postgres login role for agents'],
    [WarehouseTypes.REDSHIFT, 'The Redshift database user for agents'],
    [WarehouseTypes.TRINO, 'The Trino login for agents'],
] as const)('%s AI service account form', (warehouseType, userDescription) => {
    const slot: AiServiceAccountSlot = {
        uuid: 'slot',
        identityUuid: 'new-identity',
        projectUuid: 'project',
        warehouseConnectionUuid: null,
        kind: 'ai_service_account',
        scope: 'connection',
        warehouseType: warehouseType,
        method: 'password',
        createdByUserUuid: null,
        updatedByUserUuid: null,
        credentialSubjectUserUuid: null,
        createdAt: new Date('2026-10-09T12:00:00Z'),
        updatedAt: new Date('2026-10-09T12:00:00Z'),
    };
    const credentials = {
        type: warehouseType,
        user: 'application-id',
        password: ' secret bytes ',
    };
    const setup = () => {
        const client = new QueryClient({
            defaultOptions: { mutations: { retry: false } },
        });
        const onSaved = vi.fn();
        const onClose = vi.fn();
        const rendered = renderWithProviders(
            <QueryClientProvider client={client}>
                <AiServiceAccountForm
                    warehouseType={warehouseType}
                    projectUuid="project"
                    onSaved={onSaved}
                    onClose={onClose}
                />
            </QueryClientProvider>,
        );
        return { ...rendered, client, onSaved, onClose };
    };
    const fill = () => {
        fireEvent.change(screen.getByLabelText('User', { exact: false }), {
            target: { value: `  ${credentials.user}  ` },
        });
        fireEvent.change(screen.getByLabelText(/^Password/), {
            target: { value: credentials.password },
        });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(lightdashApi).mockResolvedValue(verification);
        const response: ApiAiServiceAccountSaveResponse = {
            status: 'ok',
            results: slot,
            verification,
        };
        vi.mocked(lightdashApiResponse).mockResolvedValue(response);
    });
    it('requires a user and non-empty password and masks the secret', () => {
        setup();
        expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Test and save' }),
        ).toBeDisabled();
        const secret = screen.getByLabelText(/^Password/);
        expect(secret).toHaveAttribute('type', 'password');
        expect(secret).toHaveAttribute('autocomplete', 'new-password');
        expect(secret).toBeRequired();
        expect(screen.getByLabelText('User', { exact: false })).toBeRequired();
        expect(
            screen.getByLabelText('User', { exact: false }),
        ).toHaveAccessibleDescription(userDescription);
        fill();
        expect(screen.getByRole('button', { name: 'Test' })).toBeEnabled();
        expect(
            screen.getByRole('button', { name: 'Test and save' }),
        ).toBeEnabled();
        fireEvent.change(secret, { target: { value: '' } });
        expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Test and save' }),
        ).toBeDisabled();
    });
    it.each([
        { user: '', password: credentials.password },
        { user: credentials.user, password: '' },
        { user: '   ', password: credentials.password },
    ])('disables both actions for invalid inputs %j', ({ user, password }) => {
        setup();
        fireEvent.change(screen.getByLabelText('User', { exact: false }), {
            target: { value: user },
        });
        fireEvent.change(screen.getByLabelText(/^Password/), {
            target: { value: password },
        });
        expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Test and save' }),
        ).toBeDisabled();
    });
    it('tests only the type, trimmed user and unchanged password and clears cached results on edit', async () => {
        const { client } = setup();
        fill();
        fireEvent.click(screen.getByRole('button', { name: 'Test' }));
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Signs in as verified-principal',
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'POST',
                sensitive: true,
                body: JSON.stringify({ credentials }),
            }),
        );
        fireEvent.change(screen.getByLabelText('User', { exact: false }), {
            target: { value: 'another-id' },
        });
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(client.getMutationCache().getAll()).toHaveLength(0);
    });
    it('saves only the type, trimmed user and unchanged password with verification', async () => {
        const { onSaved, onClose, client } = setup();
        fill();
        fireEvent.click(screen.getByRole('button', { name: 'Test and save' }));
        await waitFor(() =>
            expect(onSaved).toHaveBeenCalledWith(
                slot,
                'verified-principal',
                verification,
            ),
        );
        expect(lightdashApiResponse).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'PUT',
                sensitive: true,
                body: JSON.stringify(credentials),
            }),
        );
        expect(lightdashApi).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledOnce();
        expect(screen.getByLabelText(/^Password/)).toHaveValue('');
        expect(client.getMutationCache().getAll()).toHaveLength(0);
    });
    it.each(['Test', 'Test and save'])(
        'disables inputs and actions while %s is pending',
        async (action) => {
            let finish: (() => void) | null = null;
            const pending = new Promise<never>(() => {});
            if (action === 'Test')
                vi.mocked(lightdashApi).mockImplementation(
                    () =>
                        new Promise((resolve) => {
                            finish = () => resolve(verification);
                        }),
                );
            else vi.mocked(lightdashApiResponse).mockReturnValue(pending);
            const { onClose, unmount, client } = setup();
            fill();
            fireEvent.click(screen.getByRole('button', { name: action }));
            await waitFor(() =>
                expect(
                    screen.getByLabelText('User', { exact: false }),
                ).toBeDisabled(),
            );
            expect(screen.getByLabelText(/^Password/)).toBeDisabled();
            expect(
                screen.getByRole('button', { name: 'Cancel' }),
            ).toBeDisabled();
            expect(
                screen.getByRole('button', { name: 'Test and save' }),
            ).toBeDisabled();
            expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled();
            expect(onClose).not.toHaveBeenCalled();
            unmount();
            expect(client.getMutationCache().getAll()).toHaveLength(0);
            await act(async () => {
                finish?.();
            });
            expect(client.getMutationCache().getAll()).toHaveLength(0);
        },
    );
    it.each(['Test', 'Test and save'])(
        'shows %s request errors as alerts and clears them on edit',
        async (action) => {
            const error = {
                error: { message: 'Could not verify these credentials.' },
            };
            if (action === 'Test')
                vi.mocked(lightdashApi).mockRejectedValue(error);
            else vi.mocked(lightdashApiResponse).mockRejectedValue(error);
            const { onSaved } = setup();
            fill();
            fireEvent.click(screen.getByRole('button', { name: action }));
            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Could not verify these credentials.',
            );
            expect(screen.queryByRole('status')).not.toBeInTheDocument();
            expect(onSaved).not.toHaveBeenCalled();
            fireEvent.change(screen.getByLabelText(/^Password/), {
                target: { value: 'replacement' },
            });
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        },
    );
    it('shows a failed Test as an alert', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({
            ...verification,
            ok: false,
            principal: null,
            message: 'Access denied.',
        });
        setup();
        fill();
        fireEvent.click(screen.getByRole('button', { name: 'Test' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Access denied.',
        );
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    it('clears inputs and mutations on Cancel', async () => {
        const { onClose, client } = setup();
        fill();
        fireEvent.click(screen.getByRole('button', { name: 'Test' }));
        await screen.findByRole('status');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledOnce();
        expect(screen.getByLabelText(/^Password/)).toHaveValue('');
        expect(client.getMutationCache().getAll()).toHaveLength(0);
    });
});
