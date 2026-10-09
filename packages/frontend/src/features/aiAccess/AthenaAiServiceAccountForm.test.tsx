import {
    AthenaAuthenticationType,
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
import { AthenaAiServiceAccountForm } from './AthenaAiServiceAccountForm';

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
    observed: { principalArn: 'verified-principal' },
    message: 'Connection works.',
    checkedAt: new Date('2026-10-09T12:00:00Z'),
};
const slot: AiServiceAccountSlot = {
    uuid: 'slot',
    identityUuid: 'new-identity',
    projectUuid: 'project',
    warehouseConnectionUuid: null,
    kind: 'ai_service_account',
    scope: 'connection',
    warehouseType: WarehouseTypes.ATHENA,
    method: 'access_key',
    createdByUserUuid: null,
    updatedByUserUuid: null,
    credentialSubjectUserUuid: null,
    createdAt: new Date('2026-10-09T12:00:00Z'),
    updatedAt: new Date('2026-10-09T12:00:00Z'),
};
const credentials = {
    type: WarehouseTypes.ATHENA,
    authenticationType: AthenaAuthenticationType.ACCESS_KEY,
    accessKeyId: 'agent-access-key-id',
    secretAccessKey: ' secret bytes ',
    workGroup: 'agent-workgroup',
    s3StagingDir: 's3://agent-results/prefix/',
};
const setup = () => {
    const client = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
    });
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const rendered = renderWithProviders(
        <QueryClientProvider client={client}>
            <AthenaAiServiceAccountForm
                projectUuid="project"
                onSaved={onSaved}
                onClose={onClose}
            />
        </QueryClientProvider>,
    );
    return { ...rendered, client, onSaved, onClose };
};
const fill = () => {
    fireEvent.change(screen.getByLabelText('Access key ID', { exact: false }), {
        target: { value: credentials.accessKeyId },
    });
    fireEvent.change(
        screen.getByLabelText('Secret access key', { exact: false }),
        {
            target: { value: credentials.secretAccessKey },
        },
    );
    fireEvent.change(
        screen.getByLabelText('Agent workgroup', { exact: false }),
        {
            target: { value: credentials.workGroup },
        },
    );
    fireEvent.change(
        screen.getByLabelText('S3 results location', { exact: false }),
        {
            target: { value: credentials.s3StagingDir },
        },
    );
};

describe('Athena AI service account form', () => {
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
    it('requires non-blank credentials and routing fields and masks secrets', () => {
        setup();
        expect(
            screen.getByRole('button', { name: 'Test and save' }),
        ).toBeDisabled();
        const secret = screen.getByLabelText('Secret access key', {
            exact: false,
        });
        expect(secret).toHaveAttribute('type', 'password');
        expect(secret).toHaveAttribute('autocomplete', 'new-password');
        expect(secret).toBeRequired();
        expect(
            screen.getByLabelText('Access key ID', { exact: false }),
        ).toBeRequired();
        expect(
            screen.getByLabelText('Session token (optional)'),
        ).toHaveAttribute('type', 'password');
        expect(
            screen.getByLabelText('Agent workgroup', { exact: false }),
        ).toBeRequired();
        expect(
            screen.getByLabelText('S3 results location', { exact: false }),
        ).toBeRequired();
        fill();
        expect(
            screen.getByRole('button', { name: 'Test and save' }),
        ).toBeEnabled();
        fireEvent.change(secret, { target: { value: '   ' } });
        expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Test and save' }),
        ).toBeDisabled();
    });
    it('tests unsaved credentials and clears the result and cached secrets on edit', async () => {
        const { client } = setup();
        fill();
        fireEvent.click(screen.getByRole('button', { name: 'Test' }));
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Signs in as verified-principal',
        );
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'POST',
                sensitive: true,
                body: JSON.stringify({ credentials }),
            }),
        );
        fireEvent.change(
            screen.getByLabelText('Access key ID', { exact: false }),
            {
                target: { value: 'another-id' },
            },
        );
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(client.getMutationCache().getAll()).toHaveLength(0);
    });
    it('saves the current inputs with the verification returned by Save', async () => {
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
        expect(
            screen.getByLabelText('Secret access key', { exact: false }),
        ).toHaveValue('');
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
                    screen.getByLabelText('Access key ID', { exact: false }),
                ).toBeDisabled(),
            );
            expect(
                screen.getByLabelText('Secret access key', { exact: false }),
            ).toBeDisabled();
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
    it('shows failures inline and clears them on edit', async () => {
        vi.mocked(lightdashApiResponse).mockRejectedValue({
            error: { message: 'Could not verify these credentials.' },
        });
        const { onSaved } = setup();
        fill();
        fireEvent.click(screen.getByRole('button', { name: 'Test and save' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not verify these credentials.',
        );
        expect(onSaved).not.toHaveBeenCalled();
        fireEvent.change(
            screen.getByLabelText('Secret access key', { exact: false }),
            { target: { value: 'replacement' } },
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
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
    });
    it('clears inputs and mutations on Cancel', async () => {
        const { onClose, client } = setup();
        fill();
        fireEvent.change(screen.getByLabelText('Session token (optional)'), {
            target: { value: 'session-token' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Test' }));
        await screen.findByRole('status');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledOnce();
        expect(
            screen.getByLabelText('Secret access key', { exact: false }),
        ).toHaveValue('');
        expect(
            screen.getByLabelText('Access key ID', { exact: false }),
        ).toHaveValue('');
        expect(screen.getByLabelText('Session token (optional)')).toHaveValue(
            '',
        );
        expect(client.getMutationCache().getAll()).toHaveLength(0);
    });
    it.each([
        ['Access key ID', '   '],
        ['Secret access key', '   '],
        ['Agent workgroup', '   '],
        ['S3 results location', 'https://bucket/results'],
        ['S3 results location', 's3://'],
        ['S3 results location', 's3://bucket/results?key=value'],
        ['S3 data location (optional)', 's3://bucket/path#fragment'],
        ['Session token (optional)', '   '],
    ])('rejects invalid %s: %s', (label, value) => {
        setup();
        fill();
        fireEvent.change(screen.getByLabelText(label, { exact: false }), {
            target: { value },
        });
        expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Test and save' }),
        ).toBeDisabled();
    });
    it('sends optional credentials unchanged and omits them after clearing', async () => {
        setup();
        fill();
        const token = screen.getByLabelText('Session token (optional)');
        const data = screen.getByLabelText('S3 data location (optional)');
        fireEvent.change(token, { target: { value: ' session bytes ' } });
        fireEvent.change(data, {
            target: { value: 's3://agent-data/tables/' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Test' }));
        await screen.findByRole('status');
        expect(lightdashApi).toHaveBeenLastCalledWith(
            expect.objectContaining({
                body: JSON.stringify({
                    credentials: {
                        ...credentials,
                        sessionToken: ' session bytes ',
                        s3DataDir: 's3://agent-data/tables/',
                    },
                }),
            }),
        );
        fireEvent.change(token, { target: { value: '' } });
        fireEvent.change(data, { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: 'Test and save' }));
        await waitFor(() =>
            expect(lightdashApiResponse).toHaveBeenCalledWith(
                expect.objectContaining({ body: JSON.stringify(credentials) }),
            ),
        );
    });
});
